import { Submit } from '@/components/client';
import { Card, Field, Flash, PageHeader } from '@/components/ui';
import { deletePlaybook, savePlaybook } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';

export const metadata = { title: 'Insurer playbook' };
function Entry({ e }: { e?: any }) {
  return (
    <form action={savePlaybook} className="grid gap-3 sm:grid-cols-2">
      {e && <input type="hidden" name="id" value={e.id} />}
      <Field label="Insurer" hint='Use "All insurers" for patterns that apply everywhere'><input className="input" name="insurer" defaultValue={e?.insurer} required /></Field>
      <Field label="Topic" hint="Matched against the operation, for example Scans or Calibration"><input className="input" name="topic" defaultValue={e?.topic} required /></Field>
      <Field label="What they usually say when they deny it"><textarea className="input" name="denial_pattern" rows={3} defaultValue={e?.denial_pattern} /></Field>
      <Field label="How to answer"><textarea className="input" name="response" rows={3} defaultValue={e?.response} /></Field>
      <div className="flex gap-2"><Submit className={e ? 'btn-secondary' : 'btn-primary'} pending="Saving…">{e ? 'Save' : 'Add entry'}</Submit>
        {e && <button formAction={deletePlaybook} formNoValidate className="btn-danger">Delete</button>}</div>
    </form>
  );
}
export default async function Playbook({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser('admin');
  const entries = await q<any>('SELECT * FROM playbook ORDER BY insurer, topic');
  return (
    <>
      <PageHeader title="Insurer playbook" sub="Denial patterns by insurer. The draft uses them to pre-empt objections, and rebuttals use them to answer denials." />
      <Flash sp={await searchParams} />
      <div className="space-y-4">
        {entries.map((e: any) => <div key={e.id} className="card card-pad"><Entry e={e} /></div>)}
        <Card title="Add an entry"><Entry /></Card>
      </div>
    </>
  );
}
