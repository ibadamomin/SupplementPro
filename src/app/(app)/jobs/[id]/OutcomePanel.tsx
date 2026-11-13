import Link from 'next/link';
import { CopyButton, Submit } from '@/components/client';
import { Badge, Card, Stat } from '@/components/ui';
import { approveAllOutcomes, markSubmitted, recordOutcome } from '@/lib/actions';
import type { User } from '@/lib/auth';
import { q } from '@/lib/db';
import { fmtDateTime, usd, plural } from '@/lib/format';
import type { Item, Job } from '@/lib/jobs';
import type { Doc } from '@/lib/storage';

export async function OutcomePanel({ job, items, docs, user }: { job: Job; items: Item[]; docs: Doc[]; user: User }) {
  const approved = items.filter((i) => i.status === 'approved');
  const pkg = docs.find((d) => d.kind === 'package');
  const canRecord = user.role !== 'estimator';
  const rebuttals = await q<any>(`SELECT r.*, f.title FROM rebuttals r JOIN flagged_items f ON f.id = r.flagged_item_id WHERE r.job_id = $1 ${user.role === 'shop' ? `AND r.status = 'released'` : ''} ORDER BY r.created_at`, [job.id]);
  const submitted = approved.reduce((s, i) => s + i.amount_cents, 0);
  const won = approved.reduce((s, i) => s + (i.approved_cents ?? 0), 0);
  const open = approved.filter((i) => !i.result);
  const waiting = open.reduce((s, i) => s + i.amount_cents, 0);

  if (!approved.length) return (
    <Card title="Review complete"><p className="text-sm">The estimator reviewed this estimate and found no missed operations worth submitting. Signed off by {job.signer_name} on {fmtDateTime(job.signed_off_at)}.</p></Card>
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Supplement total" value={usd(submitted)} hint={`${plural(approved.length, 'operation')}`} />
        <Stat label="Approved by insurer" value={usd(won)} tone="good" hint={submitted - waiting > 0 ? `${Math.round((won / (submitted - waiting)) * 100)}% of decided dollars` : 'No results yet'} />
        <Stat label="Waiting on insurer" value={usd(waiting)} hint={`${plural(open.length, 'operation')} without a result`} />
      </div>

      <Card title="Supplement package" action={pkg && <a className="btn-primary btn-sm" href={`/api/files/${pkg.id}?download`}>Download PDF</a>}>
        <p className="text-sm">Reviewed and signed off by <strong>{job.signer_name}</strong>{job.signer_credentials ? ` (${job.signer_credentials})` : ''} on {fmtDateTime(job.signed_off_at)}.</p>
        {canRecord && job.status === 'delivered' && (
          <>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Download the package and add the operations to your estimate.</li>
              <li>Send it to {job.insurer || 'the insurer'} from your shop, the way you normally submit supplements.</li>
              <li>Come back and record what gets approved or denied. A denial gets you a rebuttal draft.</li>
            </ol>
            <form action={markSubmitted} className="mt-4"><input type="hidden" name="job_id" value={job.id} /><Submit className="btn-primary">I sent it to the insurer</Submit></form>
          </>
        )}
        {job.submitted_at && <p className="muted mt-2 text-sm">Sent to the insurer on {fmtDateTime(job.submitted_at)}.</p>}
      </Card>

      <Card title="Insurer results" pad={false} action={canRecord && open.length > 1 && (
        <form action={approveAllOutcomes}><input type="hidden" name="job_id" value={job.id} /><Submit className="btn-secondary btn-sm">Mark all remaining approved</Submit></form>)}>
        <ul className="divide-y divide-slate-100">
          {approved.map((it) => (
            <li key={it.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{it.title}</span><span className="tabular-nums text-slate-600">{usd(it.amount_cents)}</span>
                  {it.result === 'approved' && <Badge tone="green">Approved</Badge>}
                  {it.result === 'partial' && <Badge tone="amber">Partly approved: {usd(it.approved_cents)}</Badge>}
                  {it.result === 'denied' && <Badge tone="red">Denied</Badge>}
                </div>
                <p className="muted mt-1 text-sm">{it.reason}</p>
                {it.denial_reason && <p className="mt-1 text-sm text-red-800">Insurer's reason: {it.denial_reason}</p>}
              </div>
              {canRecord && (it.result ? (
                <form key="change" action={recordOutcome}><input type="hidden" name="job_id" value={job.id} /><input type="hidden" name="item_id" value={it.id} />
                  <Submit name="result" value="clear" className="btn-secondary btn-sm">Change</Submit></form>
              ) : (
                <form key="record" action={recordOutcome} className="flex flex-wrap items-start gap-2 md:justify-end">
                  <input type="hidden" name="job_id" value={job.id} /><input type="hidden" name="item_id" value={it.id} />
                  <Submit name="result" value="approved" className="btn-good btn-sm">Approved</Submit>
                  <details className="relative">
                    <summary className="btn-secondary btn-sm list-none">Denied or partial</summary>
                    <div className="card card-pad absolute right-0 z-10 mt-1 w-72 space-y-2 shadow-lg">
                      <label className="block"><span className="label">Insurer's reason</span><input className="input" name="denial_reason" placeholder="What the adjuster said" /></label>
                      <label className="block"><span className="label">Amount approved, if partial ($)</span><input className="input" name="approved_amount" type="number" step="0.01" min="0" /></label>
                      <div className="flex gap-2"><Submit name="result" value="denied" className="btn-danger btn-sm">Denied</Submit><Submit name="result" value="partial" className="btn-secondary btn-sm">Partly approved</Submit></div>
                    </div>
                  </details>
                </form>
              ))}
            </li>
          ))}
        </ul>
      </Card>

      {rebuttals.length > 0 && (
        <Card title="Rebuttals">
          <div className="space-y-4">
            {rebuttals.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{r.title}</span>
                  {r.status === 'released' ? <CopyButton text={r.body} label="Copy text" /> : <span className="flex items-center gap-2"><Badge tone="amber">Draft, not yet released</Badge><Link href="/admin/rebuttals" className="text-sm">Review</Link></span>}</div>
                <p className="text-sm whitespace-pre-wrap text-slate-700">{r.body}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
