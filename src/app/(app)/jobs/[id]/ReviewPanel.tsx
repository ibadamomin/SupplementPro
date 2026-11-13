import { Submit } from '@/components/client';
import { Badge, Card } from '@/components/ui';
import { addItem, itemAction, saveLetter, setPhotoLabel, signOffAction } from '@/lib/actions';
import { q } from '@/lib/db';
import { CATEGORIES, LABOR_TYPES, categoryLabel, rateFor, usd } from '@/lib/format';
import type { Item, Job, Shop } from '@/lib/jobs';
import { activeRules } from '@/lib/rules';
import type { Doc } from '@/lib/storage';
import { ItemEditor } from './ItemEditor';

export async function ReviewPanel({ job, shop, items, docs }: { job: Job; shop: Shop; items: Item[]; docs: Doc[] }) {
  const lines = await q<any>('SELECT * FROM estimate_lines WHERE job_id = $1 ORDER BY id', [job.id]);
  const rules = await activeRules();
  const rates = Object.fromEntries(LABOR_TYPES.map((t) => [t, rateFor(shop.rates, t)]));
  const estimate = docs.find((d) => d.kind === 'estimate');
  const photos = docs.filter((d) => d.kind === 'photo');
  const pending = items.filter((i) => i.status === 'pending').length;
  const approved = items.filter((i) => i.status === 'approved');
  const total = approved.reduce((s, i) => s + i.amount_cents, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <Card title="Insurer estimate" pad={false} action={estimate && <a href={`/api/files/${estimate.id}`} target="_blank" className="text-sm">Open in new tab</a>}>
          {estimate ? <iframe src={`/api/files/${estimate.id}#view=FitH`} title="Insurer estimate" className="h-[62vh] w-full rounded-b-xl" /> : <p className="muted p-5 text-sm">No estimate PDF on this job.</p>}
        </Card>
        <Card title={`Photos (${photos.length})`}>
          {photos.length ? (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p, i) => (
                <div key={p.id}>
                  <a href={`/api/files/${p.id}`} target="_blank"><img src={`/api/files/${p.id}`} alt={p.label || `Photo ${i + 1}`} loading="lazy" className="aspect-4/3 w-full rounded-lg border border-slate-200 object-cover" /></a>
                  <form action={setPhotoLabel} className="mt-1.5 flex gap-1.5">
                    <input type="hidden" name="doc_id" value={p.id} />
                    <input className="input py-1 text-xs" name="label" defaultValue={p.label} placeholder={`Label for photo ${i + 1} (shown in the package)`} />
                    <Submit className="btn-secondary btn-sm">Save</Submit>
                  </form>
                </div>
              ))}
            </div>
          ) : <p className="muted text-sm">The shop did not attach photos.</p>}
        </Card>
        <details className="card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Parsed estimate lines ({lines.length})</summary>
          <div className="max-h-[60vh] overflow-auto border-t border-slate-200">
            <table className="tbl text-xs">
              <thead><tr><th>#</th><th>Oper</th><th>Description</th><th className="text-right">Price</th><th className="text-right">Labor</th><th className="text-right">Paint</th></tr></thead>
              <tbody>{lines.map((l: any) => (
                <tr key={l.id}><td>{l.line_no}</td><td>{l.operation}</td><td>{l.description}{l.part_number && <span className="muted"> · {l.part_number}</span>}</td>
                  <td className="text-right tabular-nums">{l.price_cents != null ? usd(l.price_cents) : ''}</td><td className="text-right tabular-nums">{l.labor_hours ?? ''}</td><td className="text-right tabular-nums">{l.paint_hours ?? ''}</td></tr>
              ))}</tbody>
            </table>
            {!lines.length && <p className="muted p-5 text-sm">No lines could be parsed. Work from the PDF above.</p>}
          </div>
        </details>
      </div>

      <div className="space-y-4">
        <div className="card card-pad flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-xs font-medium text-slate-500">Approved so far</div><div className="text-2xl font-semibold tracking-tight">{usd(total)}</div></div>
          <div className="flex gap-2 text-sm"><Badge tone="green">{approved.length} approved</Badge><Badge tone="amber">{pending} to decide</Badge><Badge>{items.length - approved.length - pending} rejected</Badge></div>
        </div>
        {job.notes && <div className="card card-pad text-sm"><div className="label">Notes from the shop</div><p className="whitespace-pre-wrap">{job.notes}</p></div>}

        {items.map((it) => (
          <form key={`${it.id}-${it.status}-${it.amount_cents}`} action={itemAction}
            className={`card card-pad space-y-3 border-l-4 ${it.status === 'approved' ? 'border-l-emerald-500' : it.status === 'rejected' ? 'border-l-slate-300 opacity-70' : 'border-l-amber-400'}`}>
            <input type="hidden" name="job_id" value={job.id} /><input type="hidden" name="item_id" value={it.id} />
            <div className="flex items-start gap-2">
              <input className="input font-medium" name="title" defaultValue={it.title} aria-label="Operation" />
              <Badge tone={it.origin === 'ai' ? 'blue' : 'violet'}>{it.origin === 'ai' ? 'Draft' : 'Added'}</Badge>
            </div>
            <label className="block"><span className="label">Justification (printed in the letter)</span><textarea className="input" name="reason" rows={2} defaultValue={it.reason} /></label>
            <label className="block"><span className="label">Reference</span><input className="input" name="source" defaultValue={it.source} /></label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ItemEditor hours={it.labor_hours} type={it.labor_type} amountCents={it.amount_cents} rates={rates} />
              <label className="block"><span className="label">Category</span>
                <select className="input" name="category" defaultValue={it.category}>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {it.status !== 'approved' && <Submit name="intent" value="approve" className="btn-good btn-sm">Approve</Submit>}
              {it.status !== 'rejected' && <Submit name="intent" value="reject" className="btn-danger btn-sm">Reject</Submit>}
              <Submit name="intent" value="save" className="btn-secondary btn-sm">Save changes</Submit>
              {it.status !== 'pending' && <Submit name="intent" value="undo" className="btn-secondary btn-sm">Undo decision</Submit>}
              {it.origin === 'estimator' && <Submit name="intent" value="delete" className="btn-danger btn-sm">Delete</Submit>}
              <span className="muted ml-auto text-xs">{it.status === 'approved' ? 'Approved' : it.status === 'rejected' ? 'Rejected' : 'Needs a decision'}</span>
            </div>
          </form>
        ))}
        {!items.length && <div className="card card-pad muted text-sm">The draft found nothing to flag. Review the estimate and add any missed operations below.</div>}

        <details className="card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Add an operation the draft missed</summary>
          <form action={addItem} className="space-y-3 border-t border-slate-200 p-5">
            <input type="hidden" name="job_id" value={job.id} />
            <label className="block"><span className="label">From the rules library (fills any field you leave blank)</span>
              <select className="input" name="rule_id" defaultValue=""><option value="">Not from the library</option>{rules.map((r) => <option key={r.rule_id} value={r.rule_id}>{r.code} — {r.title}</option>)}</select></label>
            <label className="block"><span className="label">Operation</span><input className="input" name="title" /></label>
            <label className="block"><span className="label">Justification</span><textarea className="input" name="reason" rows={2} /></label>
            <label className="block"><span className="label">Reference</span><input className="input" name="source" /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className="label">Hours</span><input className="input" name="labor_hours" type="number" step="0.1" min="0" /></label>
              <label className="block"><span className="label">Labor type</span><select className="input" name="labor_type">{LABOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label className="block"><span className="label">Amount ($, optional)</span><input className="input" name="amount" type="number" step="0.01" min="0" /></label>
            </div>
            <Submit className="btn-secondary" pending="Adding…">Add as approved</Submit>
          </form>
        </details>

        <form action={signOffAction} className="card card-pad space-y-3">
          <input type="hidden" name="job_id" value={job.id} />
          <label className="block"><span className="label">Cover note (opens the letter to the insurer, in the shop's name)</span>
            <textarea className="input" name="letter" rows={6} defaultValue={job.letter} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1" />
            <span>I reviewed the estimate, photos and every operation above, and I stand behind what is approved.</span></label>
          <div className="flex flex-wrap items-center gap-2">
            <Submit className="btn-primary" pending="Building package…" disabled={pending > 0}>Sign off and send to shop</Submit>
            <button formAction={saveLetter} formNoValidate className="btn-secondary">Save note only</button>
            {pending > 0 && <span className="muted text-sm">Decide the remaining {pending} item{pending > 1 ? 's' : ''} first.</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
