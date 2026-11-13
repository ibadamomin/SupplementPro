import { CopyButton, Submit } from '@/components/client';
import { Card, Flash, PageHeader } from '@/components/ui';
import { changePassword } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { LABOR_TYPES, PLANS, rateFor, usd } from '@/lib/format';
import { getShop } from '@/lib/jobs';

export const metadata = { title: 'Settings' };
export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const shop = u.shop_id ? await getShop(u.shop_id) : null;
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <Flash sp={await searchParams} />
      <Card title="Your account">
        <dl className="mb-5 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="muted text-xs">Name</dt><dd>{u.name}</dd></div><div><dt className="muted text-xs">Email</dt><dd>{u.email}</dd></div></dl>
        <form action={changePassword} className="flex flex-wrap items-end gap-2">
          <label className="block flex-1"><span className="label">New password (10 characters or more)</span><input className="input" type="password" name="password" minLength={10} required autoComplete="new-password" /></label>
          <Submit className="btn-secondary" pending="Saving…">Change password</Submit>
        </form>
      </Card>
      {shop && (
        <>
          <Card title="Your plan">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="muted text-xs">Plan</dt><dd>{PLANS[shop.plan]?.label ?? shop.plan}</dd></div>
              <div><dt className="muted text-xs">Monthly fee</dt><dd>{usd(shop.monthly_fee_cents, { whole: true })}</dd></div>
              <div><dt className="muted text-xs">Jobs included</dt><dd>{shop.job_cap} a month, then $25 each</dd></div>
            </dl>
            <p className="muted mt-4 text-xs">Labor rates used to price supplements: {LABOR_TYPES.map((t) => `${t} $${rateFor(shop.rates, t)}/hr`).join(' · ')}. Tell us if these change.</p>
          </Card>
          <Card title="Send jobs by email">
            {domain ? (
              <><p className="text-sm">Forward the insurer's estimate (PDF) and your photos to this address. A job is created automatically.</p>
                <div className="mt-3 flex items-center gap-2"><code className="rounded-md bg-slate-100 px-2.5 py-1.5 text-sm">intake+{shop.intake_token}@{domain}</code><CopyButton text={`intake+${shop.intake_token}@${domain}`} /></div>
                <p className="muted mt-3 text-xs">Put the repair order number in the subject, for example "RO 10442".</p></>
            ) : <p className="muted text-sm">Email intake is not switched on yet. Upload jobs from the Jobs page.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
