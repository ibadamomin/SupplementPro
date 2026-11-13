import type { User } from './auth';
import { q, q1 } from './db';
import type { Rates } from './format';
import type { Doc } from './storage';

export interface Shop {
  id: string; name: string; intake_token: string; contact_name: string; phone: string; address: string;
  plan: string; monthly_fee_cents: number; job_cap: number; rates: Rates; insurers: string[]; notes: string; active: boolean; created_at: Date;
}
export interface Job {
  id: string; number: number; shop_id: string; shop_name: string; ro_number: string; insurer: string; claim_number: string; adjuster: string;
  vin: string; vehicle: string; vehicle_data: Record<string, string>; notes: string; source: string; status: string; error: string;
  estimate_total_cents: number | null; letter: string; ai_meta: Record<string, any>; rules_version: number;
  assigned_to: string | null; assignee_name: string | null; signed_off_by: string | null; signer_name: string | null; signer_credentials: string | null;
  created_at: Date; due_at: Date; drafted_at: Date | null; assigned_at: Date | null; signed_off_at: Date | null; submitted_at: Date | null; closed_at: Date | null;
}
export interface Item {
  id: string; job_id: string; rule_id: string | null; title: string; category: string; reason: string; source: string;
  labor_hours: number; labor_type: string; amount_cents: number; origin: string; status: string; ai_snapshot: any; sort: number;
  result: string | null; approved_cents: number | null; denial_reason: string | null;
}
const JOB = `
  SELECT j.*, s.name AS shop_name, a.name AS assignee_name, so.name AS signer_name, so.credentials AS signer_credentials
  FROM jobs j JOIN shops s ON s.id = j.shop_id
  LEFT JOIN users a ON a.id = j.assigned_to LEFT JOIN users so ON so.id = j.signed_off_by`;

export const canSee = (u: User, j: { shop_id: string; assigned_to: string | null }) =>
  u.role === 'admin' || (u.role === 'shop' && u.shop_id === j.shop_id) || (u.role === 'estimator' && j.assigned_to === u.id);
export const canReview = (u: User, j: { assigned_to: string | null; status: string }) =>
  ['needs_review', 'in_review'].includes(j.status) && (u.role === 'admin' || (u.role === 'estimator' && j.assigned_to === u.id));

export const getJobRaw = (id: string) => q1<Job>(`${JOB} WHERE j.id = $1`, [id]);
export async function getJobFor(u: User, id: string): Promise<Job | null> {
  const j = await getJobRaw(id);
  return j && canSee(u, j) ? j : null;
}
export async function listJobs(u: User, f: { status?: string; shopId?: string; limit?: number } = {}): Promise<(Job & { flagged_cents: number; item_count: number })[]> {
  const where: string[] = []; const p: unknown[] = [];
  if (u.role === 'shop') { p.push(u.shop_id); where.push(`j.shop_id = $${p.length}`); }
  if (u.role === 'estimator') { p.push(u.id); where.push(`j.assigned_to = $${p.length}`); }
  if (f.shopId && u.role === 'admin') { p.push(f.shopId); where.push(`j.shop_id = $${p.length}`); }
  if (f.status === 'open') where.push(`j.status IN ('processing','failed','needs_review','in_review')`);
  else if (f.status) { p.push(f.status); where.push(`j.status = $${p.length}`); }
  p.push(f.limit ?? 200);
  return q(`
    SELECT x.*, coalesce(t.flagged_cents, 0)::float8 AS flagged_cents, coalesce(t.item_count, 0)::int AS item_count
    FROM (${JOB} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}) x
    LEFT JOIN (SELECT job_id, sum(amount_cents) FILTER (WHERE status <> 'rejected') AS flagged_cents, count(*) FILTER (WHERE status <> 'rejected') AS item_count
               FROM flagged_items GROUP BY job_id) t ON t.job_id = x.id
    ORDER BY x.created_at DESC LIMIT $${p.length}`, p);
}
export const getItems = (jobId: string) => q<Item>(`
  SELECT f.*, o.result, o.approved_cents, o.denial_reason
  FROM flagged_items f LEFT JOIN outcomes o ON o.flagged_item_id = f.id
  WHERE f.job_id = $1 ORDER BY f.sort, f.created_at`, [jobId]);
export const getDocs = (jobId: string) => q<Doc>('SELECT * FROM documents WHERE job_id = $1 ORDER BY created_at', [jobId]);
export const getShop = (id: string) => q1<Shop>('SELECT * FROM shops WHERE id = $1', [id]);
export const listShops = () => q<Shop>('SELECT * FROM shops ORDER BY name');
export const monthUsage = async (shopId: string) =>
  (await q1<{ n: number }>(`SELECT count(*)::int AS n FROM jobs WHERE shop_id = $1 AND created_at >= date_trunc('month', now())`, [shopId]))!.n;
export const playbookFor = (insurer: string) =>
  q<{ topic: string; denial_pattern: string; response: string }>(
    `SELECT topic, denial_pattern, response FROM playbook WHERE lower(insurer) = lower($1) OR lower(insurer) IN ('all insurers','all','any') ORDER BY (lower(insurer) = lower($1)) DESC`, [insurer || '']);
export async function logReview(jobId: string, userId: string | null, action: string, itemId: string | null, before: unknown, after: unknown) {
  await q('INSERT INTO reviews (job_id, flagged_item_id, user_id, action, before, after) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
    [jobId, itemId, userId, action, JSON.stringify(before ?? null), JSON.stringify(after ?? null)]);
}
