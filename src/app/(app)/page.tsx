import Link from 'next/link';
import { JobTable } from '@/components/JobTable';
import { Card, PageHeader, Stat } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { q1 } from '@/lib/db';
import { pct, usd, plural } from '@/lib/format';
import { getShop, listJobs, monthUsage } from '@/lib/jobs';
import { adminOverview, currentMonth, monthLabel, monthlyReport } from '@/lib/reports';

export default async function Dashboard() {
  const u = await requireUser();
  const jobs = await listJobs(u, { limit: 100 });

  if (u.role === 'shop') {
    const shop = (await getShop(u.shop_id!))!;
    const used = await monthUsage(shop.id);
    const r = await monthlyReport(shop.id, currentMonth());
    const action = jobs.filter((j) => ['delivered', 'submitted'].includes(j.status));
    return (
      <>
        <PageHeader title={shop.name} sub={`${monthLabel(currentMonth())} so far`}><Link href="/jobs/new" className="btn-primary">Upload a job</Link></PageHeader>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Jobs this month" value={`${used} of ${shop.job_cap}`} hint={used > shop.job_cap ? `${used - shop.job_cap} over plan at $25 each` : `${shop.job_cap - used} left on your plan`} />
          <Stat label="Supplements prepared" value={usd(r.submitted, { whole: true })} hint={`${plural(r.items, 'operation')} on ${plural(r.jobsWithItems, 'job')}`} />
          <Stat label="Approved by insurers" value={usd(r.approved, { whole: true })} tone="good" hint={r.decided ? `${pct(r.approved, r.decided)} of decided dollars` : 'No results recorded yet'} />
          <Stat label="Waiting on insurers" value={usd(r.pending, { whole: true })} hint="Record results as they come in" />
        </div>
        {action.length > 0 && <Card title="Needs your action" pad={false} className="mb-6"><JobTable jobs={action} /></Card>}
        <Card title="Recent jobs" pad={false} action={<Link href="/jobs" className="text-sm">View all</Link>}>
          <JobTable jobs={jobs.slice(0, 10)} empty="No jobs yet. Upload an insurer estimate and teardown photos to get your first supplement." />
        </Card>
      </>
    );
  }

  if (u.role === 'estimator') {
    const open = jobs.filter((j) => j.status === 'in_review').sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    const done = (await q1<{ n: number }>(`SELECT count(*)::int AS n FROM jobs WHERE signed_off_by = $1 AND signed_off_at >= date_trunc('month', now())`, [u.id]))!.n;
    return (
      <>
        <PageHeader title={`Hello, ${u.name.split(' ')[0]}`} sub="Jobs assigned to you, soonest due first" />
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Waiting for your review" value={open.length} />
          <Stat label="Signed off this month" value={done} />
          <Stat label="Earned this month" value={usd(done * u.pay_per_job_cents)} hint={`${usd(u.pay_per_job_cents)} per job`} />
        </div>
        <Card title="Your queue" pad={false}><JobTable jobs={open} showShop empty="Nothing assigned right now. You will get an email when a job is assigned." /></Card>
      </>
    );
  }

  const o = await adminOverview();
  const attention = jobs.filter((j) => ['needs_review', 'failed'].includes(j.status) || (j.status === 'in_review' && +new Date(j.due_at) < Date.now()));
  const aiTotal = o.ai.kept + o.ai.edited + o.ai.rejected;
  return (
    <>
      <PageHeader title="Overview" sub={monthLabel(o.month)}><Link href="/jobs/new" className="btn-secondary">Upload for a shop</Link></PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for assignment" value={o.counts.unassigned} tone={o.counts.unassigned ? 'bad' : undefined} hint={`${o.counts.in_review} in review`} />
        <Stat label="Overdue (past 24 hours)" value={o.counts.overdue} tone={o.counts.overdue ? 'bad' : undefined} hint={o.counts.failed ? `${o.counts.failed} failed processing` : 'Turnaround target is 24 hours'} />
        <Stat label="Supplements signed off" value={usd(o.money.submitted, { whole: true })} hint={`${plural(o.counts.month_jobs, 'job')} received this month`} />
        <Stat label="Approved by insurers" value={usd(o.money.approved, { whole: true })} tone="good" hint={o.money.decided ? `${pct(o.money.approved, o.money.decided)} of decided dollars` : 'No results recorded yet'} />
      </div>
      <Card title="Needs attention" pad={false} className="mb-6"><JobTable jobs={attention} showShop showAssignee empty="Nothing waiting. New jobs appear here until they are assigned." /></Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Estimators" pad={false} className="lg:col-span-2">
          <table className="tbl">
            <thead><tr><th>Name</th><th className="text-right">Jobs this month</th><th className="text-right">Avg turnaround</th><th className="text-right">Insurer approval</th><th className="text-right">Owed this month</th></tr></thead>
            <tbody>
              {o.estimators.map((e: any) => (
                <tr key={e.id}><td>{e.name}</td><td className="text-right tabular-nums">{e.month_jobs}</td><td className="text-right tabular-nums">{e.all_jobs ? `${e.avg_hours.toFixed(1)} h` : '—'}</td>
                  <td className="text-right tabular-nums">{pct(e.approved, e.decided)}</td><td className="text-right tabular-nums">{usd(e.month_jobs * e.pay_per_job_cents)}</td></tr>
              ))}
              {!o.estimators.length && <tr><td colSpan={5} className="muted text-center">No estimators yet. Add one under Team.</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card title="AI draft quality">
          <p className="text-3xl font-semibold tracking-tight">{pct(o.ai.kept, aiTotal)}</p>
          <p className="muted mt-1 text-sm">of drafted items approved without edits (all signed-off jobs)</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="muted">Approved as drafted</dt><dd className="tabular-nums">{o.ai.kept}</dd></div>
            <div className="flex justify-between"><dt className="muted">Approved after edits</dt><dd className="tabular-nums">{o.ai.edited}</dd></div>
            <div className="flex justify-between"><dt className="muted">Rejected</dt><dd className="tabular-nums">{o.ai.rejected}</dd></div>
            <div className="flex justify-between"><dt className="muted">Added by estimators</dt><dd className="tabular-nums">{o.ai.added}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
