export const usd = (cents: number | null | undefined, opts: { whole?: boolean } = {}) =>
  cents == null ? '—' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: opts.whole ? 0 : 2, minimumFractionDigits: opts.whole ? 0 : 2 });
export const toCents = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const TZ = process.env.APP_TIMEZONE || 'America/Chicago';
export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ }) : '—';
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—';
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');
export const hoursBetween = (a: Date | string, b: Date | string) => (new Date(b).getTime() - new Date(a).getTime()) / 3600_000;

export const LABOR_TYPES = ['body', 'refinish', 'mechanical', 'frame'] as const;
export type LaborType = (typeof LABOR_TYPES)[number];
export const CATEGORIES = ['diagnostics', 'calibration', 'refinish', 'materials', 'corrosion', 'structural', 'r_and_i', 'mechanical', 'safety', 'admin', 'other'] as const;
export const categoryLabel = (c: string) => ({ r_and_i: 'R&I', admin: 'Admin' } as Record<string, string>)[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
export interface Rates { body?: number; refinish?: number; mechanical?: number; frame?: number; }
export const DEFAULT_RATES: Required<Rates> = { body: 60, refinish: 60, mechanical: 110, frame: 75 };
export const rateFor = (rates: Rates | null | undefined, t: string) => num((rates as any)?.[t], (DEFAULT_RATES as any)[t] ?? 60);
export const PLANS: Record<string, { label: string; fee: number; cap: number }> = {
  founding: { label: 'Founding', fee: 40000, cap: 20 },
  starter: { label: 'Starter', fee: 50000, cap: 20 },
  pro: { label: 'Pro', fee: 90000, cap: 45 },
};
export const EXTRA_JOB_CENTS = 2500;
export const STATUS: Record<string, { label: string; tone: 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'violet' }> = {
  processing: { label: 'Processing', tone: 'gray' },
  failed: { label: 'Needs attention', tone: 'red' },
  needs_review: { label: 'Awaiting review', tone: 'amber' },
  in_review: { label: 'In review', tone: 'blue' },
  delivered: { label: 'Ready to submit', tone: 'violet' },
  submitted: { label: 'Submitted to insurer', tone: 'blue' },
  closed: { label: 'Closed', tone: 'green' },
};
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
