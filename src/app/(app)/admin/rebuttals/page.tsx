import Link from 'next/link';
import { Submit } from '@/components/client';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { rebuttalAction } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fmtDateTime, usd } from '@/lib/format';

export const metadata = { title: 'Rebuttals' };
export default async function Rebuttals() {
  const u = await requireUser('admin', 'estimator');
  const rows = await q<any>(`
    SELECT r.*, f.title, f.amount_cents, o.denial_reason, o.result, o.approved_cents, j.number, j.insurer, j.vehicle, s.name AS shop_name
    FROM rebuttals r JOIN flagged_items f ON f.id = r.flagged_item_id JOIN jobs j ON j.id = r.job_id JOIN shops s ON s.id = j.shop_id
    LEFT JOIN outcomes o ON o.flagged_item_id = f.id
    WHERE ($1 = 'admin' OR j.assigned_to = $2) ORDER BY (r.status = 'draft') DESC, r.created_at DESC LIMIT 100`, [u.role, u.id]);
  const drafts = rows.filter((r) => r.status === 'draft');
  return (
    <>
      <PageHeader title="Rebuttals" sub="When a shop records a denial, a rebuttal is drafted here. Check it, edit it, then release it to the shop." />
      {!rows.length && <Card><Empty>No denials recorded yet.</Empty></Card>}
      <div className="space-y-4">
        {drafts.map((r: any) => (
          <form key={r.id} action={rebuttalAction} className="card card-pad space-y-3">
            <input type="hidden" name="id" value={r.id} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><Link href={`/jobs/${r.job_id}`} className="font-medium">#{r.number} {r.vehicle}</Link><span className="muted text-sm"> · {r.shop_name} · {r.insurer || 'insurer unknown'}</span></div>
              <Badge tone="amber">Draft</Badge>
            </div>
            <p className="text-sm"><strong>{r.title}</strong> ({usd(r.amount_cents)}) was {r.result === 'partial' ? `partly approved (${usd(r.approved_cents)})` : 'denied'}. Insurer's reason: {r.denial_reason || 'not given'}</p>
            <textarea className="input" name="body" rows={10} defaultValue={r.body} />
            <div className="flex gap-2"><Submit name="intent" value="release" pending="Releasing…">Release to shop</Submit><Submit name="intent" value="save" className="btn-secondary">Save draft</Submit><Submit name="intent" value="discard" className="btn-danger">Discard</Submit></div>
          </form>
        ))}
        {rows.filter((r) => r.status === 'released').length > 0 && (
          <Card title="Released" pad={false}>
            <table className="tbl"><thead><tr><th>Job</th><th>Operation</th><th>Shop</th><th>Released</th></tr></thead>
              <tbody>{rows.filter((r) => r.status === 'released').map((r: any) => (
                <tr key={r.id}><td><Link href={`/jobs/${r.job_id}`}>#{r.number} {r.vehicle}</Link></td><td>{r.title}</td><td>{r.shop_name}</td><td>{fmtDateTime(r.released_at)}</td></tr>))}</tbody></table>
          </Card>
        )}
      </div>
    </>
  );
}
