import Link from 'next/link';
import { Badge, Card, Flash, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { categoryLabel, pct, usd } from '@/lib/format';
import { allRules, libraryVersion } from '@/lib/rules';
import { RuleForm } from './RuleForm';

export const metadata = { title: 'Rules library' };
export default async function Rules({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser('admin');
  const rules = await allRules();
  // How each rule performs: how often estimators keep it and how often insurers pay it.
  const stats = new Map((await q<any>(`
    SELECT f.rule_id, count(*)::int AS flagged, count(*) FILTER (WHERE f.status = 'approved')::int AS kept,
           count(*) FILTER (WHERE f.status IN ('approved','rejected'))::int AS decided,
           coalesce(sum(o.approved_cents), 0)::float8 AS paid, coalesce(sum(f.amount_cents) FILTER (WHERE o.result IS NOT NULL), 0)::float8 AS ruled
    FROM flagged_items f LEFT JOIN outcomes o ON o.flagged_item_id = f.id WHERE f.rule_id IS NOT NULL GROUP BY f.rule_id`)).map((s) => [s.rule_id, s]));
  const docs = new Map((await q<any>(`SELECT rule_id, count(*)::int AS n FROM documents WHERE rule_id IS NOT NULL GROUP BY rule_id`)).map((d) => [d.rule_id, d.n]));
  return (
    <>
      <PageHeader title="Rules library" sub={`${rules.filter((r) => !r.archived).length} active rules · library version ${await libraryVersion()}. Every edit creates a new version; jobs record the version they were drafted with.`} />
      <Flash sp={await searchParams} />
      <Card pad={false} className="mb-6">
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Rule</th><th>Category</th><th className="text-right">Default</th><th className="text-right">Flagged</th><th className="text-right">Kept by estimators</th><th className="text-right">Paid by insurers</th><th className="text-right">Docs</th></tr></thead>
          <tbody>{rules.map((r) => { const s = stats.get(r.rule_id); return (
            <tr key={r.rule_id} className={r.archived ? 'opacity-50' : ''}>
              <td><Link href={`/admin/rules/${r.rule_id}`} className="font-medium">{r.title}</Link><div className="muted text-xs">{r.code} · v{r.version} {r.archived && <Badge>Archived</Badge>}</div></td>
              <td>{categoryLabel(r.category)}</td>
              <td className="text-right tabular-nums whitespace-nowrap">{r.labor_hours ? `${r.labor_hours} h ${r.labor_type}` : ''}{r.labor_hours && r.flat_amount_cents ? ' + ' : ''}{r.flat_amount_cents ? usd(r.flat_amount_cents, { whole: true }) : ''}</td>
              <td className="text-right tabular-nums">{s?.flagged ?? 0}</td><td className="text-right tabular-nums">{s ? pct(s.kept, s.decided) : '—'}</td>
              <td className="text-right tabular-nums">{s ? pct(s.paid, s.ruled) : '—'}</td><td className="text-right tabular-nums">{docs.get(r.rule_id) ?? 0}</td>
            </tr>); })}</tbody>
        </table></div>
      </Card>
      <Card title="Add a rule"><RuleForm /></Card>
    </>
  );
}
