import Link from 'next/link';
import type { ReactNode } from 'react';
import { STATUS } from '@/lib/format';

const TONES: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700', blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-800',
  green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', violet: 'bg-violet-50 text-violet-700',
};
export function Badge({ tone = 'gray', children }: { tone?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}
export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const s = STATUS[status] ?? { label: status, tone: 'gray' };
  return <span className="inline-flex items-center gap-1.5"><Badge tone={s.tone}>{s.label}</Badge>{overdue && <Badge tone="red">Overdue</Badge>}</span>;
}
export function PageHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1>{title}</h1>{sub && <p className="muted mt-1 text-sm">{sub}</p>}</div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
export function Card({ title, action, children, pad = true, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3"><h2>{title}</h2>{action}</div>}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card card-pad">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : ''}`}>{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === 'string' ? sp.ok : '', error = typeof sp.error === 'string' ? sp.error : '';
  if (!ok && !error) return null;
  return <div role="status" className={`mb-5 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || ok}</div>;
}
export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="muted mt-1 block text-xs">{hint}</span>}</label>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted px-5 py-10 text-center text-sm">{children}</div>;
}
export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium no-underline hover:no-underline ${current === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{t.label}</Link>
      ))}
    </div>
  );
}
