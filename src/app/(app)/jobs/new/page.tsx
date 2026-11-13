import { PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getShop, listShops } from '@/lib/jobs';
import { NewJobForm } from './NewJobForm';

export const metadata = { title: 'Upload a job' };
export default async function NewJob() {
  const u = await requireUser('admin', 'shop');
  const shops = u.role === 'admin' ? (await listShops()).filter((s) => s.active) : [(await getShop(u.shop_id!))!];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Upload a job" sub="Send the insurer's estimate and your teardown photos. You get a reviewed supplement package within 24 hours." />
      <NewJobForm shops={shops.map((s) => ({ id: s.id, name: s.name, insurers: s.insurers }))} pickShop={u.role === 'admin'} />
    </div>
  );
}
