import { Submit } from '@/components/client';
import { Field } from '@/components/ui';
import { saveRule } from '@/lib/actions';
import { CATEGORIES, LABOR_TYPES, categoryLabel } from '@/lib/format';
import type { Rule } from '@/lib/rules';

export function RuleForm({ rule }: { rule?: Rule }) {
  return (
    <form action={saveRule} className="grid gap-4 sm:grid-cols-2">
      {rule && <input type="hidden" name="id" value={rule.rule_id} />}
      {!rule && <Field label="Code" hint="Short unique name, for example TPMS-RELEARN"><input className="input uppercase" name="code" required /></Field>}
      <Field label="Operation title" className={rule ? 'sm:col-span-2' : ''}><input className="input" name="title" defaultValue={rule?.title} required /></Field>
      <Field label="Why it is needed" hint="Printed in the letter as the default justification" className="sm:col-span-2"><textarea className="input" name="description" rows={3} defaultValue={rule?.description} /></Field>
      <Field label="Flag when the estimate contains" hint="Comma separated. Whole words; end with * for a prefix; op:refn matches an operation; * means every job." className="sm:col-span-2">
        <textarea className="input font-mono text-xs" name="triggers" rows={2} defaultValue={rule?.triggers.join(', ')} /></Field>
      <Field label="Skip when the estimate already contains" hint="Comma separated, same matching rules" className="sm:col-span-2">
        <textarea className="input font-mono text-xs" name="satisfied_by" rows={2} defaultValue={rule?.satisfied_by.join(', ')} /></Field>
      <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-4">
        <Field label="Category"><select className="input" name="category" defaultValue={rule?.category ?? 'other'}>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></Field>
        <Field label="Default hours"><input className="input" name="labor_hours" type="number" step="0.1" min="0" defaultValue={rule?.labor_hours ?? 0} /></Field>
        <Field label="Labor type"><select className="input" name="labor_type" defaultValue={rule?.labor_type ?? 'body'}>{LABOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field label="Flat amount ($)" hint="Sublet or materials"><input className="input" name="flat_amount" type="number" step="0.01" min="0" defaultValue={(rule?.flat_amount_cents ?? 0) / 100} /></Field>
      </div>
      <Field label="Reference" hint="Printed under the item. Attach the actual document below after saving." className="sm:col-span-2"><input className="input" name="source" defaultValue={rule?.source} /></Field>
      {rule && <Field label="What changed (kept in the version history)" className="sm:col-span-2"><input className="input" name="change_note" placeholder="For example: raised default hours after estimator feedback" /></Field>}
      <div><Submit pending="Saving…">{rule ? 'Save as new version' : 'Create rule'}</Submit></div>
    </form>
  );
}
