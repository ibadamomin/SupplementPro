import { notFound } from 'next/navigation';
import { AutoRefresh, Submit } from '@/components/client';
import { Card, Flash, PageHeader, StatusBadge } from '@/components/ui';
import { addPhotos, assignJob, reopenJob, reprocessJob, updateJobDetails } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { canReview, getDocs, getItems, getJobFor, getShop } from '@/lib/jobs';
import { OutcomePanel } from './OutcomePanel';
import { ReviewPanel } from './ReviewPanel';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return { title: `Job ${(await params).id.slice(0, 4)}` }; }

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const job = await getJobFor(u, (await params).id);
  if (!job) notFound();
  const [items, docs, shop] = await Promise.all([getItems(job.id), getDocs(job.id), getShop(job.shop_id)]);
  const reviewing = canReview(u, job);
  const done = ['delivered', 'submitted', 'closed'].includes(job.status);
  const open = !done && job.status !== 'failed';
  const overdue = open && +new Date(job.due_at) < Date.now();
  const team = u.role === 'admin' ? await q<{ id: string; name: string; role: string }>(`SELECT id, name, role FROM users WHERE role IN ('estimator','admin') AND active ORDER BY role DESC, name`) : [];
  const log = u.role === 'admin' ? await q<any>(`SELECT r.*, us.name FROM reviews r LEFT JOIN users us ON us.id = r.user_id WHERE r.job_id = $1 ORDER BY r.id DESC LIMIT 200`, [job.id]) : [];
  const photos = docs.filter((d) => d.kind === 'photo');
  const estimate = docs.find((d) => d.kind === 'estimate');

  return (
    <>
      <PageHeader title={<>#{job.number} {job.vehicle || 'Vehicle pending'}</>}
        sub={[u.role !== 'shop' && job.shop_name, job.insurer, job.claim_number && `Claim ${job.claim_number}`, `Received ${fmtDateTime(job.created_at)}`, open && `Due ${fmtDateTime(job.due_at)}`].filter(Boolean).join(' · ')}>
        <StatusBadge status={job.status} overdue={overdue} />
      </PageHeader>
      <Flash sp={await searchParams} />

      {u.role === 'admin' && (
        <div className="card card-pad mb-6 flex flex-wrap items-end gap-3">
          <form action={assignJob} className="flex items-end gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <label className="block"><span className="label">Estimator</span>
              <select name="user_id" defaultValue={job.assigned_to ?? ''} className="input w-56" disabled={done}>
                <option value="">Unassigned</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}{t.role === 'admin' ? ' (admin)' : ''}</option>)}</select></label>
            {!done && <Submit className="btn-secondary" pending="Assigning…">Assign</Submit>}
          </form>
          {!done && job.status !== 'processing' && <form action={reprocessJob}><input type="hidden" name="job_id" value={job.id} /><Submit className="btn-secondary" pending="Starting…">Re-run draft</Submit></form>}
          {['delivered', 'closed'].includes(job.status) && !job.submitted_at && <form action={reopenJob}><input type="hidden" name="job_id" value={job.id} /><Submit className="btn-secondary">Reopen for review</Submit></form>}
          <span className="muted ml-auto text-xs">Draft: {job.ai_meta?.mode === 'claude' ? `AI (${job.ai_meta.model})` : job.ai_meta?.mode === 'rules' ? 'rules library only' : 'not run yet'} · rules v{job.rules_version}</span>
        </div>
      )}

      {job.status === 'processing' && (
        <Card><AutoRefresh /><div className="flex items-center gap-3 text-sm"><span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Reading the estimate and drafting the supplement. This usually takes under a minute; the page updates on its own.</div></Card>
      )}
      {job.status === 'failed' && (
        <Card title="Processing failed"><p className="text-sm text-red-800">{job.error || 'Unknown error.'}</p>
          <p className="muted mt-2 text-sm">{u.role === 'shop' ? 'We have been notified and will sort this out. You do not need to upload again.' : 'Use "Re-run draft" above, or check the uploaded estimate.'}</p></Card>
      )}
      {job.error && job.status !== 'failed' && u.role !== 'shop' && !done && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{job.error}</div>
      )}

      {reviewing && shop && <ReviewPanel job={job} shop={shop} items={items} docs={docs} />}
      {done && <OutcomePanel job={job} items={items} docs={docs} user={u} />}

      {!reviewing && !done && job.status !== 'processing' && job.status !== 'failed' && (
        <Card title="What happens next">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>The estimate was read and a first draft of missed operations is ready ({items.length} flagged so far).</li>
            <li>{job.assignee_name ? `${job.assignee_name} is reviewing it line by line.` : 'An estimator is being assigned to review it line by line.'}</li>
            <li>You get an email with the signed-off supplement package by {fmtDateTime(job.due_at)}.</li>
          </ol>
        </Card>
      )}

      {(!reviewing || done) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Files">
            <ul className="space-y-1.5 text-sm">
              {estimate && <li><a href={`/api/files/${estimate.id}`} target="_blank">Insurer estimate</a> <span className="muted">({estimate.filename})</span></li>}
              {!estimate && <li className="muted">No estimate attached.</li>}
            </ul>
            {photos.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{photos.map((p, i) => (
              <a key={p.id} href={`/api/files/${p.id}`} target="_blank"><img src={`/api/files/${p.id}`} alt={p.label || `Photo ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-md border border-slate-200 object-cover" /></a>))}</div>}
            {!done && u.role !== 'estimator' && (
              <form action={addPhotos} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <label className="block flex-1"><span className="label">Add more photos</span><input className="input" type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required /></label>
                <Submit className="btn-secondary" pending="Uploading…">Add</Submit>
              </form>
            )}
          </Card>
          <DetailsCard job={job} editable={!done && u.role !== 'estimator'} />
        </div>
      )}
      {reviewing && <div className="mt-6"><DetailsCard job={job} editable /></div>}

      {u.role === 'admin' && log.length > 0 && (
        <details className="card mt-6">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Review history ({log.length})</summary>
          <table className="tbl border-t border-slate-200 text-xs">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Change</th></tr></thead>
            <tbody>{log.map((r: any) => (
              <tr key={r.id}><td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</td><td>{r.name ?? 'System'}</td><td>{r.action}</td>
                <td className="max-w-xl break-words text-slate-600">{r.action === 'edit' && r.before && r.after
                  ? Object.keys(r.after).filter((k) => String(r.before[k]) !== String(r.after[k])).map((k) => `${k}: ${r.before[k]} → ${r.after[k]}`).join('; ')
                  : r.after?.title ?? (r.after ? JSON.stringify(r.after).slice(0, 160) : r.before?.title ?? '')}</td></tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </>
  );
}

function DetailsCard({ job, editable }: { job: Awaited<ReturnType<typeof getJobFor>> & {}; editable: boolean }) {
  const rows: [string, string, string][] = [['insurer', 'Insurer', job.insurer], ['claim_number', 'Claim number', job.claim_number], ['adjuster', 'Adjuster', job.adjuster],
    ['vehicle', 'Vehicle', job.vehicle], ['vin', 'VIN', job.vin], ['ro_number', 'Repair order', job.ro_number]];
  return (
    <Card title="Job details">
      {editable ? (
        <form action={updateJobDetails} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="job_id" value={job.id} />
          {rows.map(([k, label, v]) => <label key={k} className="block"><span className="label">{label}</span><input className="input" name={k} defaultValue={v} /></label>)}
          <div className="sm:col-span-2 flex items-center gap-3"><Submit className="btn-secondary" pending="Saving…">Save details</Submit><span className="muted text-xs">These appear in the letter header.</span></div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{rows.map(([k, label, v]) => <div key={k}><dt className="muted text-xs">{label}</dt><dd>{v || '—'}</dd></div>)}</dl>
      )}
    </Card>
  );
}
