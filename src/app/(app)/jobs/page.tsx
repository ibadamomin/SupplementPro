import Link from 'next/link';
import { JobTable } from '@/components/JobTable';
import { Card, PageHeader, Tabs } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { listJobs, listShops } from '@/lib/jobs';

export const metadata = { title: 'Jobs' };
export default async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const status = sp.status || (u.role === 'estimator' ? 'in_review' : 'all');
  const jobs = await listJobs(u, { status: status === 'all' ? '' : status, shopId: sp.shop });
  const shops = u.role === 'admin' ? await listShops() : [];
  const qs = (s: string) => `/jobs?status=${s}${sp.shop ? `&shop=${encodeURIComponent(sp.shop)}` : ''}`;
  const tabs = u.role === 'estimator'
    ? [{ key: 'in_review', label: 'To review' }, { key: 'delivered', label: 'Signed off' }, { key: 'all', label: 'All' }]
    : [{ key: 'all', label: 'All' }, { key: 'open', label: 'In progress' }, { key: 'delivered', label: 'Ready to submit' }, { key: 'submitted', label: 'Submitted' }, { key: 'closed', label: 'Closed' }];
  return (
    <>
      <PageHeader title={u.role === 'estimator' ? 'My queue' : 'Jobs'}>
        {u.role === 'admin' && (
          <form className="flex items-center gap-2">
            <input type="hidden" name="status" value={status} />
            <select name="shop" defaultValue={sp.shop ?? ''} className="input w-48"><option value="">All shops</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <button className="btn-secondary">Filter</button>
          </form>
        )}
        {u.role !== 'estimator' && <Link href="/jobs/new" className="btn-primary">Upload a job</Link>}
      </PageHeader>
      <Tabs current={status} items={tabs.map((t) => ({ ...t, href: qs(t.key) }))} />
      <Card pad={false}><JobTable jobs={jobs} showShop={u.role !== 'shop'} showAssignee={u.role === 'admin'} empty="No jobs match this view." /></Card>
    </>
  );
}
