import { q, q1 } from './db';
import { EXTRA_JOB_CENTS } from './format';
import { getShop } from './jobs';

const TZ = process.env.APP_TIMEZONE || 'America/Chicago';
export const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
export const monthLabel = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shiftMonth = (m: string, by: number) => { const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7); };
const inMonth = (col: string) => `to_char(${col} AT TIME ZONE '${TZ}', 'YYYY-MM') = $2`;

export async function monthlyReport(shopId: string, month: string) {
  const shop = (await getShop(shopId))!;
  const head = (await q1<any>(`
    SELECT count(*)::int AS reviewed,
           coalesce(avg(extract(epoch FROM (signed_off_at - created_at)) / 3600), 0)::float8 AS avg_hours,
           count(*) FILTER (WHERE signed_off_at <= due_at)::int AS on_time
    FROM jobs WHERE shop_id = $1 AND signed_off_at IS NOT NULL AND ${inMonth('signed_off_at')}`, [shopId, month]))!;
  const uploaded = (await q1<{ n: number }>(`SELECT count(*)::int AS n FROM jobs WHERE shop_id = $1 AND ${inMonth('created_at')}`, [shopId, month]))!.n;
  const ITEMS = `
    FROM flagged_items f JOIN jobs j ON j.id = f.job_id LEFT JOIN outcomes o ON o.flagged_item_id = f.id
    WHERE j.shop_id = $1 AND j.signed_off_at IS NOT NULL AND ${inMonth('j.signed_off_at')} AND f.status = 'approved'`;
  const SUMS = `
    coalesce(sum(f.amount_cents), 0)::float8 AS submitted,
    coalesce(sum(o.approved_cents), 0)::float8 AS approved,
    coalesce(sum(f.amount_cents) FILTER (WHERE o.result IS NOT NULL), 0)::float8 AS decided,
    coalesce(sum(f.amount_cents) FILTER (WHERE o.result IS NULL), 0)::float8 AS pending,
    count(*)::int AS items`;
  const totals = (await q1<any>(`SELECT ${SUMS}, count(DISTINCT j.id)::int AS jobs_with_items ${ITEMS}`, [shopId, month]))!;
  const byInsurer = await q<any>(`SELECT coalesce(nullif(j.insurer, ''), 'Unknown') AS insurer, ${SUMS} ${ITEMS} GROUP BY 1 ORDER BY submitted DESC`, [shopId, month]);
  const topItems = await q<any>(`SELECT f.title, count(*)::int AS n, sum(f.amount_cents)::float8 AS submitted, coalesce(sum(o.approved_cents), 0)::float8 AS approved ${ITEMS} GROUP BY f.title ORDER BY submitted DESC LIMIT 8`, [shopId, month]);
  const extraJobs = Math.max(0, uploaded - shop.job_cap);
  return {
    shop, month, uploaded, reviewed: head.reviewed as number, avgHours: head.avg_hours as number, onTime: head.on_time as number,
    submitted: totals.submitted as number, approved: totals.approved as number, decided: totals.decided as number, pending: totals.pending as number,
    items: totals.items as number, jobsWithItems: totals.jobs_with_items as number,
    byInsurer, topItems, extraJobs, extraCents: extraJobs * EXTRA_JOB_CENTS,
    roi: shop.monthly_fee_cents > 0 ? totals.approved / shop.monthly_fee_cents : 0,
    guaranteeMet: totals.approved >= 5 * shop.monthly_fee_cents,
  };
}

export async function adminOverview() {
  const month = currentMonth();
  const counts = (await q1<any>(`
    SELECT count(*) FILTER (WHERE status = 'needs_review')::int AS unassigned,
           count(*) FILTER (WHERE status = 'in_review')::int AS in_review,
           count(*) FILTER (WHERE status IN ('needs_review','in_review','processing') AND due_at < now())::int AS overdue,
           count(*) FILTER (WHERE status = 'failed')::int AS failed,
           count(*) FILTER (WHERE to_char(created_at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1)::int AS month_jobs
    FROM jobs`, [month]))!;
  const money = (await q1<any>(`
    SELECT coalesce(sum(f.amount_cents), 0)::float8 AS submitted, coalesce(sum(o.approved_cents), 0)::float8 AS approved,
           coalesce(sum(f.amount_cents) FILTER (WHERE o.result IS NOT NULL), 0)::float8 AS decided
    FROM flagged_items f JOIN jobs j ON j.id = f.job_id LEFT JOIN outcomes o ON o.flagged_item_id = f.id
    WHERE f.status = 'approved' AND j.signed_off_at IS NOT NULL AND to_char(j.signed_off_at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1`, [month]))!;
  // Draft quality: how much of the AI draft estimators keep as written.
  const ai = (await q1<any>(`
    SELECT count(*) FILTER (WHERE f.origin = 'ai' AND f.status = 'approved' AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.flagged_item_id = f.id AND r.action = 'edit'))::int AS kept,
           count(*) FILTER (WHERE f.origin = 'ai' AND f.status = 'approved' AND EXISTS (SELECT 1 FROM reviews r WHERE r.flagged_item_id = f.id AND r.action = 'edit'))::int AS edited,
           count(*) FILTER (WHERE f.origin = 'ai' AND f.status = 'rejected')::int AS rejected,
           count(*) FILTER (WHERE f.origin = 'estimator' AND f.status = 'approved')::int AS added
    FROM flagged_items f JOIN jobs j ON j.id = f.job_id WHERE j.signed_off_at IS NOT NULL`))!;
  const estimators = await q<any>(`
    SELECT u.id, u.name, u.pay_per_job_cents,
           count(j.id) FILTER (WHERE to_char(j.signed_off_at AT TIME ZONE '${TZ}', 'YYYY-MM') = $1)::int AS month_jobs,
           count(j.id)::int AS all_jobs,
           coalesce(avg(extract(epoch FROM (j.signed_off_at - coalesce(j.assigned_at, j.created_at))) / 3600), 0)::float8 AS avg_hours,
           (SELECT coalesce(sum(o.approved_cents), 0)::float8 FROM outcomes o JOIN jobs jj ON jj.id = o.job_id WHERE jj.signed_off_by = u.id) AS approved,
           (SELECT coalesce(sum(f.amount_cents), 0)::float8 FROM outcomes o JOIN flagged_items f ON f.id = o.flagged_item_id JOIN jobs jj ON jj.id = o.job_id WHERE jj.signed_off_by = u.id) AS decided
    FROM users u LEFT JOIN jobs j ON j.signed_off_by = u.id
    WHERE u.role IN ('estimator','admin') AND u.active GROUP BY u.id, u.name, u.pay_per_job_cents
    HAVING u.role = 'estimator' OR count(j.id) > 0 ORDER BY u.name`, [month]);
  return { month, counts, money, ai, estimators };
}
