import Link from 'next/link';
import { PrintButton } from '@/components/client';
import { Badge, Card, Empty, PageHeader, Stat } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { pct, usd, plural } from '@/lib/format';
import { listShops } from '@/lib/jobs';
import { currentMonth, monthLabel, monthlyReport, shiftMonth } from '@/lib/reports';

export const metadata = { title: 'Monthly report' };
export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser('admin', 'shop');
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month : currentMonth();
  const shops = u.role === 'admin' ? await listShops() : [];
  const shopId = u.role === 'shop' ? u.shop_id! : sp.shop || shops[0]?.id;
  if (!shopId) return <><PageHeader title="Monthly report" /><Card><Empty>Create a shop first.</Empty></Card></>;
  const r = await monthlyReport(shopId, month);
  const link = (m: string) => `/reports?month=${m}${u.role === 'admin' ? `&shop=${shopId}` : ''}`;
  return (
    <>
      <PageHeader title={`${r.shop.name}: ${monthLabel(month)}`} sub="Jobs signed off in this month and what insurers have paid on them so far">
        {u.role === 'admin' && (
          <form className="flex gap-2"><input type="hidden" name="month" value={month} />
            <select name="shop" defaultValue={shopId} className="input w-48">{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="btn-secondary">Show</button></form>
        )}
        <Link href={link(shiftMonth(month, -1))} className="btn-secondary">Previous</Link>
        {month < currentMonth() && <Link href={link(shiftMonth(month, 1))} className="btn-secondary">Next</Link>}
        <PrintButton />
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Jobs reviewed" value={r.reviewed} hint={r.reviewed ? `${r.onTime} of ${r.reviewed} within 24 hours · avg ${r.avgHours.toFixed(1)} h` : `${r.uploaded} uploaded`} />
        <Stat label="Supplements prepared" value={usd(r.submitted, { whole: true })} hint={`${plural(r.items, 'operation')} on ${plural(r.jobsWithItems, 'job')}`} />
        <Stat label="Approved by insurers" value={usd(r.approved, { whole: true })} tone="good" hint={r.decided ? `${pct(r.approved, r.decided)} of decided dollars` : 'No results recorded yet'} />
        <Stat label="Return on your fee" value={r.roi ? `${r.roi.toFixed(1)}x` : '—'} hint={`Plan fee ${usd(r.shop.monthly_fee_cents, { whole: true })}${r.extraJobs ? ` + ${r.extraJobs} extra jobs (${usd(r.extraCents, { whole: true })})` : ''}`} />
      </div>
      <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${r.guaranteeMet ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {r.guaranteeMet
          ? `Guarantee met: insurers approved ${usd(r.approved, { whole: true })}, more than 5 times the ${usd(r.shop.monthly_fee_cents, { whole: true })} fee.`
          : `Guarantee threshold is ${usd(5 * r.shop.monthly_fee_cents, { whole: true })} approved (5 times the fee). So far ${usd(r.approved, { whole: true })} is approved and ${usd(r.pending, { whole: true })} is still waiting on insurers.`}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By insurer" pad={false}>
          {r.byInsurer.length ? (
            <table className="tbl"><thead><tr><th>Insurer</th><th className="text-right">Submitted</th><th className="text-right">Approved</th><th className="text-right">Approval rate</th><th className="text-right">Waiting</th></tr></thead>
              <tbody>{r.byInsurer.map((i: any) => (
                <tr key={i.insurer}><td>{i.insurer}</td><td className="text-right tabular-nums">{usd(i.submitted)}</td><td className="text-right tabular-nums">{usd(i.approved)}</td>
                  <td className="text-right tabular-nums">{i.decided ? <Badge tone={i.approved / i.decided >= 0.7 ? 'green' : 'amber'}>{pct(i.approved, i.decided)}</Badge> : '—'}</td><td className="text-right tabular-nums">{usd(i.pending)}</td></tr>))}</tbody></table>
          ) : <Empty>No supplements signed off this month.</Empty>}
        </Card>
        <Card title="Most often missed" pad={false}>
          {r.topItems.length ? (
            <table className="tbl"><thead><tr><th>Operation</th><th className="text-right">Jobs</th><th className="text-right">Submitted</th><th className="text-right">Approved</th></tr></thead>
              <tbody>{r.topItems.map((i: any) => (<tr key={i.title}><td>{i.title}</td><td className="text-right tabular-nums">{i.n}</td><td className="text-right tabular-nums">{usd(i.submitted)}</td><td className="text-right tabular-nums">{usd(i.approved)}</td></tr>))}</tbody></table>
          ) : <Empty>Nothing to show yet.</Empty>}
        </Card>
      </div>
    </>
  );
}
