import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';

export const metadata = { title: 'Outbox' };
export default async function Outbox() {
  await requireUser('admin');
  const rows = await q<any>('SELECT * FROM emails ORDER BY id DESC LIMIT 200');
  const smtp = !!process.env.SMTP_URL;
  return (
    <>
      <PageHeader title="Outbox" sub={smtp ? 'Every email the system sent or received.' : 'Email sending is not set up (SMTP_URL is empty). Messages are recorded here instead of being delivered.'} />
      <Card pad={false}>
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((e: any) => (
              <li key={e.id}><details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Badge tone={e.status === 'sent' || e.status === 'received' ? 'green' : e.status === 'failed' || e.status === 'rejected' ? 'red' : 'gray'}>{e.direction === 'in' ? 'In: ' : ''}{e.status === 'logged' ? 'Not delivered' : e.status}</Badge>
                  <span className="font-medium">{e.subject}</span><span className="muted">{e.direction === 'in' ? 'from' : 'to'} {e.recipient}</span>
                  <span className="muted ml-auto whitespace-nowrap">{fmtDateTime(e.created_at)}</span>
                </summary>
                <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm">
                  {e.error && <p className="mb-2 text-red-700">{e.error}</p>}
                  {e.attachment && <p className="muted mb-2">Attachment: {e.attachment}</p>}
                  <pre className="font-sans whitespace-pre-wrap text-slate-700">{e.body}</pre>
                </div>
              </details></li>
            ))}
          </ul>
        ) : <Empty>No emails yet.</Empty>}
      </Card>
    </>
  );
}
