import Link from 'next/link';
import { Empty, StatusBadge } from './ui';
import { fmtDateTime, usd } from '@/lib/format';
import type { Job } from '@/lib/jobs';

export function JobTable({ jobs, showShop, showAssignee, empty = 'No jobs yet.' }: { jobs: (Job & { flagged_cents: number; item_count: number })[]; showShop?: boolean; showAssignee?: boolean; empty?: string }) {
  if (!jobs.length) return <Empty>{empty}</Empty>;
  const now = Date.now();
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead><tr><th>Job</th>{showShop && <th>Shop</th>}<th>Insurer</th><th>Status</th>{showAssignee && <th>Estimator</th>}<th className="text-right">Supplement</th><th>Received</th><th>Due</th></tr></thead>
        <tbody>
          {jobs.map((j) => {
            const open = ['processing', 'needs_review', 'in_review'].includes(j.status);
            return (
              <tr key={j.id} className="hover:bg-slate-50">
                <td><Link href={`/jobs/${j.id}`} className="font-medium">#{j.number} {j.vehicle || 'Vehicle pending'}</Link><div className="muted text-xs">{j.ro_number ? `RO ${j.ro_number}` : j.source === 'email' ? 'Received by email' : ' '}</div></td>
                {showShop && <td>{j.shop_name}</td>}
                <td>{j.insurer || '—'}</td>
                <td><StatusBadge status={j.status} overdue={open && new Date(j.due_at).getTime() < now} /></td>
                {showAssignee && <td>{j.assignee_name ?? <span className="muted">Unassigned</span>}</td>}
                <td className="text-right tabular-nums">{j.item_count ? <>{usd(j.flagged_cents)}<div className="muted text-xs">{j.item_count} items</div></> : '—'}</td>
                <td className="whitespace-nowrap">{fmtDateTime(j.created_at)}</td>
                <td className="whitespace-nowrap">{open ? fmtDateTime(j.due_at) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
