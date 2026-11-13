import { plural } from '@/lib/format';
import { Submit } from '@/components/client';
import { Badge, Card, Field, Flash, PageHeader } from '@/components/ui';
import { createUser, updateUser } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';

export const metadata = { title: 'Team' };
export default async function Team({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser('admin');
  const users = await q<any>(`SELECT u.*, (SELECT count(*)::int FROM jobs j WHERE j.assigned_to = u.id AND j.status = 'in_review') AS open_jobs FROM users u WHERE role IN ('admin','estimator') ORDER BY role, name`);
  return (
    <>
      <PageHeader title="Team" sub="Estimators review and sign off drafts. Admins can do everything." />
      <Flash sp={await searchParams} />
      <Card pad={false} className="mb-6">
        <ul className="divide-y divide-slate-100">
          {users.map((p: any) => (
            <li key={p.id} className="px-5 py-4">
              <form action={updateUser} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Name"><input className="input w-44" name="name" defaultValue={p.name} required /></Field>
                <Field label="Credentials (shown to shops)"><input className="input w-64" name="credentials" defaultValue={p.credentials} placeholder="I-CAR Platinum, 12 years estimating" /></Field>
                <Field label="Pay per job ($)"><input className="input w-28" name="pay_per_job" type="number" step="0.5" min="0" defaultValue={p.pay_per_job_cents / 100} /></Field>
                <Field label="Reset password"><input className="input w-40" name="password" type="text" placeholder="Leave blank" autoComplete="off" /></Field>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} disabled={p.id === me.id} /> Active</label>
                <Submit className="btn-secondary" pending="Saving…">Save</Submit>
              </form>
              <div className="muted mt-1.5 flex items-center gap-2 text-xs">{p.email} <Badge tone={p.role === 'admin' ? 'violet' : 'blue'}>{p.role}</Badge> {plural(p.open_jobs, 'open job')} {!p.active && <Badge>Disabled</Badge>}</div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Add a team member">
        <form action={createUser} className="grid gap-4 sm:grid-cols-3">
          <Field label="Name"><input className="input" name="name" required /></Field>
          <Field label="Email"><input className="input" name="email" type="email" required /></Field>
          <Field label="Role"><select className="input" name="role" defaultValue="estimator"><option value="estimator">Estimator</option><option value="admin">Admin</option></select></Field>
          <Field label="Credentials"><input className="input" name="credentials" placeholder="I-CAR Platinum, 12 years estimating" /></Field>
          <Field label="Pay per job ($)"><input className="input" name="pay_per_job" type="number" step="0.5" min="0" defaultValue={22} /></Field>
          <Field label="Temporary password" hint="10+ characters; emailed to them"><input className="input" name="password" type="text" minLength={10} required autoComplete="off" /></Field>
          <div><Submit pending="Creating…">Add team member</Submit></div>
        </form>
      </Card>
    </>
  );
}
