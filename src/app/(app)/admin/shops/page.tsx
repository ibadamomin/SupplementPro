import Link from 'next/link';
import { Badge, Card, Empty, Flash, PageHeader } from '@/components/ui';
import { createShop } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { PLANS, usd } from '@/lib/format';
import { ShopForm } from './ShopForm';

export const metadata = { title: 'Shops' };
export default async function Shops({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser('admin');
  const shops = await q<any>(`
    SELECT s.*, (SELECT count(*)::int FROM jobs j WHERE j.shop_id = s.id AND j.created_at >= date_trunc('month', now())) AS month_jobs,
           (SELECT count(*)::int FROM users u WHERE u.shop_id = s.id AND u.active) AS user_count
    FROM shops s ORDER BY s.active DESC, s.name`);
  const mrr = shops.filter((s) => s.active).reduce((t: number, s: any) => t + s.monthly_fee_cents, 0);
  return (
    <>
      <PageHeader title="Shops" sub={`${shops.filter((s) => s.active).length} active · ${usd(mrr, { whole: true })} monthly recurring revenue`} />
      <Flash sp={await searchParams} />
      <Card pad={false} className="mb-6">
        {shops.length ? (
          <table className="tbl"><thead><tr><th>Shop</th><th>Plan</th><th className="text-right">Fee</th><th className="text-right">Jobs this month</th><th className="text-right">Users</th><th /></tr></thead>
            <tbody>{shops.map((s: any) => (
              <tr key={s.id}><td><Link href={`/admin/shops/${s.id}`} className="font-medium">{s.name}</Link><div className="muted text-xs">{s.contact_name}</div></td>
                <td>{PLANS[s.plan]?.label ?? s.plan} {!s.active && <Badge>Inactive</Badge>}</td><td className="text-right tabular-nums">{usd(s.monthly_fee_cents, { whole: true })}</td>
                <td className="text-right tabular-nums">{s.month_jobs} of {s.job_cap}{s.month_jobs > s.job_cap && <> <Badge tone="amber">over</Badge></>}</td><td className="text-right tabular-nums">{s.user_count}</td>
                <td className="text-right"><Link href={`/reports?shop=${s.id}`} className="text-sm">Report</Link></td></tr>))}</tbody></table>
        ) : <Empty>No shops yet. Add your first one below.</Empty>}
      </Card>
      <Card title="Add a shop"><ShopForm action={createShop} /></Card>
    </>
  );
}
