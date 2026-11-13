import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Submit } from '@/components/client';
import { Badge, Card, Flash, PageHeader } from '@/components/ui';
import { deleteRuleDoc, toggleRuleArchived, uploadRuleDoc } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { getRule } from '@/lib/rules';
import { RuleForm } from '../RuleForm';

export default async function RulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireUser('admin');
  const rule = await getRule((await params).id);
  if (!rule) notFound();
  const versions = await q<any>(`SELECT v.*, u.name FROM rule_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.rule_id = $1 ORDER BY v.version DESC`, [rule.rule_id]);
  const docs = await q<any>(`SELECT * FROM documents WHERE rule_id = $1 ORDER BY created_at`, [rule.rule_id]);
  return (
    <>
      <PageHeader title={<>{rule.title} {rule.archived && <Badge>Archived</Badge>}</>} sub={<><Link href="/admin/rules">Rules library</Link> · {rule.code} · version {rule.version}</>}>
        <form action={toggleRuleArchived}><input type="hidden" name="id" value={rule.rule_id} /><Submit className="btn-secondary">{rule.archived ? 'Restore rule' : 'Archive rule'}</Submit></form>
      </PageHeader>
      <Flash sp={await searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Rule" className="lg:col-span-2"><RuleForm rule={rule} /></Card>
        <div className="space-y-6">
          <Card title="Supporting documents">
            <p className="muted mb-3 text-sm">OEM position statements or procedure pages. They are appended to every package that includes this operation.</p>
            <ul className="mb-4 space-y-2 text-sm">
              {docs.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between gap-2"><a href={`/api/files/${d.id}`} target="_blank" className="truncate">{d.filename}</a>
                  <form action={deleteRuleDoc}><input type="hidden" name="doc_id" value={d.id} /><Submit className="btn-danger btn-sm">Remove</Submit></form></li>
              ))}
              {!docs.length && <li className="muted">Nothing attached yet.</li>}
            </ul>
            <form action={uploadRuleDoc} className="space-y-2">
              <input type="hidden" name="id" value={rule.rule_id} />
              <input className="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png" required />
              <Submit className="btn-secondary" pending="Uploading…">Attach document</Submit>
            </form>
          </Card>
          <Card title="Version history" pad={false}>
            <ul className="divide-y divide-slate-100 text-sm">
              {versions.map((v: any) => (
                <li key={v.id} className="px-5 py-3"><div className="font-medium">Version {v.version}</div>
                  <div className="muted text-xs">{fmtDateTime(v.created_at)} · {v.name ?? 'System'}</div>
                  <div className="mt-1 text-xs text-slate-600">{v.change_note || 'No note'} · {v.labor_hours} h {v.labor_type}{v.flat_amount_cents ? ` + $${v.flat_amount_cents / 100}` : ''}</div></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
