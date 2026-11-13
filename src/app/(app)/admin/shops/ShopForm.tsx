import { Submit } from '@/components/client';
import { Field } from '@/components/ui';
import { DEFAULT_RATES, LABOR_TYPES, PLANS } from '@/lib/format';
import type { Shop } from '@/lib/jobs';

export function ShopForm({ action, shop }: { action: (fd: FormData) => Promise<void>; shop?: Shop }) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {shop && <input type="hidden" name="id" value={shop.id} />}
      <Field label="Shop name"><input className="input" name="name" defaultValue={shop?.name} required /></Field>
      <Field label="Owner or main contact" hint="Signs the supplement letter"><input className="input" name="contact_name" defaultValue={shop?.contact_name} /></Field>
      <Field label="Phone"><input className="input" name="phone" defaultValue={shop?.phone} /></Field>
      <Field label="Address"><input className="input" name="address" defaultValue={shop?.address} /></Field>
      <Field label="Plan"><select className="input" name="plan" defaultValue={shop?.plan ?? 'founding'}>{Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.label} (${p.fee / 100}/mo, {p.cap} jobs)</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monthly fee ($)" hint="Blank uses the plan price"><input className="input" name="monthly_fee" type="number" step="1" min="0" defaultValue={shop ? shop.monthly_fee_cents / 100 : ''} /></Field>
        <Field label="Jobs included"><input className="input" name="job_cap" type="number" min="0" defaultValue={shop?.job_cap ?? ''} /></Field>
      </div>
      <div className="sm:col-span-2">
        <span className="label">Labor rates ($ per hour)</span>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {LABOR_TYPES.map((t) => <Field key={t} label={t[0].toUpperCase() + t.slice(1)}><input className="input" name={`rate_${t}`} type="number" step="0.01" min="0" defaultValue={(shop?.rates as any)?.[t] ?? DEFAULT_RATES[t]} /></Field>)}
        </div>
      </div>
      <Field label="Main insurers" hint="Comma separated" className="sm:col-span-2"><input className="input" name="insurers" defaultValue={shop?.insurers?.join(', ')} placeholder="State Farm, Progressive, GEICO" /></Field>
      <Field label="Internal notes" className="sm:col-span-2"><textarea className="input" name="notes" rows={2} defaultValue={shop?.notes} /></Field>
      <div className="flex items-center gap-4 sm:col-span-2">
        <Submit pending="Saving…">{shop ? 'Save shop' : 'Create shop'}</Submit>
        {shop && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={shop.active} /> Active</label>}
      </div>
    </form>
  );
}
