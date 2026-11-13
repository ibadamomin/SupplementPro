import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Submit } from '@/components/client';
import { Badge, Card, Field, Flash, PageHeader } from '@/components/ui';
import { createUser, updateShop, updateUser } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { getShop } from '@/lib/jobs';
import { ShopForm } from '../ShopForm';

export default async function ShopPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser('admin');
  const shop = await getShop((await params).id);
  if (!shop) notFound();
  const users = await q<any>(`SELECT id, name, email, active FROM users WHERE shop_id = $1 ORDER BY name`, [shop.id]);
  const ret = `/admin/shops/${shop.id}`;
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  return (
    <>
      <PageHeader title={shop.name} sub={<Link href="/admin/shops">All shops</Link>}>
        <Link href={`/jobs?shop=${shop.id}`} className="btn-secondary">Jobs</Link><Link href={`/reports?shop=${shop.id}`} className="btn-secondary">Monthly report</Link>
      </PageHeader>
      <Flash sp={await searchParams} />
      <div className="space-y-6">
        <Card title="Shop details"><ShopForm action={updateShop} shop={shop} />
          <p className="muted mt-4 text-xs">Email intake address: {domain ? <code>intake+{shop.intake_token}@{domain}</code> : 'set INBOUND_EMAIL_DOMAIN to enable'}</p></Card>
        <Card title="People at this shop" pad={false}>
          <ul className="divide-y divide-slate-100">
            {users.map((p: any) => (
              <li key={p.id} className="px-5 py-3">
                <form action={updateUser} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="return" value={ret} />
                  <Field label="Name"><input className="input w-48" name="name" defaultValue={p.name} required /></Field>
                  <div className="pb-2 text-sm">{p.email} {!p.active && <Badge>Disabled</Badge>}</div>
                  <Field label="Reset password"><input className="input w-44" name="password" type="text" placeholder="Leave blank to keep" autoComplete="off" /></Field>
                  <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} /> Active</label>
                  <Submit className="btn-secondary" pending="Saving…">Save</Submit>
                </form>
              </li>
            ))}
            {!users.length && <li className="muted px-5 py-6 text-sm">Nobody yet. Add the owner or estimator below so they can upload jobs.</li>}
          </ul>
        </Card>
        <Card title="Add a person">
          <form action={createUser} className="grid gap-4 sm:grid-cols-4">
            <input type="hidden" name="role" value="shop" /><input type="hidden" name="shop_id" value={shop.id} /><input type="hidden" name="return" value={ret} />
            <Field label="Name"><input className="input" name="name" required /></Field>
            <Field label="Email"><input className="input" name="email" type="email" required /></Field>
            <Field label="Temporary password" hint="10+ characters; emailed to them"><input className="input" name="password" type="text" minLength={10} required autoComplete="off" /></Field>
            <div className="flex items-end pb-5"><Submit pending="Creating…">Add person</Submit></div>
          </form>
        </Card>
      </div>
    </>
  );
}
