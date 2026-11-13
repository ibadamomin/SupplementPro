import Link from 'next/link';
import { logoutAction } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q1 } from '@/lib/db';
import { APP_NAME } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const shop = u.shop_id ? await q1<{ name: string }>('SELECT name FROM shops WHERE id = $1', [u.shop_id]) : null;
  const nav: [string, string][] = [['/', 'Dashboard'], ['/jobs', u.role === 'estimator' ? 'My queue' : 'Jobs']];
  if (u.role !== 'estimator') nav.push(['/reports', 'Reports']);
  if (u.role === 'admin') nav.push(['/admin/shops', 'Shops'], ['/admin/team', 'Team'], ['/admin/rules', 'Rules'], ['/admin/playbook', 'Playbook'], ['/admin/rebuttals', 'Rebuttals'], ['/admin/outbox', 'Outbox']);
  if (u.role === 'estimator') nav.push(['/admin/rebuttals', 'Rebuttals']);
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900 no-underline hover:no-underline">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">S</span>{APP_NAME}
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-x-1 text-sm">
            {nav.map(([href, label]) => <Link key={href} href={href} className="rounded-md px-2.5 py-1.5 font-medium text-slate-600 no-underline hover:bg-slate-100 hover:text-slate-900 hover:no-underline">{label}</Link>)}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/settings" className="text-slate-700 no-underline">{u.name}<span className="muted"> · {shop?.name ?? (u.role === 'admin' ? 'Admin' : 'Estimator')}</span></Link>
            <form action={logoutAction}><button className="btn-secondary btn-sm">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
