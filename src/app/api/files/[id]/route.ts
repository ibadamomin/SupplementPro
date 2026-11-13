import { getUser } from '@/lib/auth';
import { q1 } from '@/lib/db';
import { canSee, getJobRaw } from '@/lib/jobs';
import { readDocument, type Doc } from '@/lib/storage';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response('Not signed in', { status: 401 });
  const d = await q1<Doc>('SELECT * FROM documents WHERE id = $1', [(await params).id]);
  if (!d) return new Response('Not found', { status: 404 });
  if (d.job_id) { const j = await getJobRaw(d.job_id); if (!j || !canSee(u, j)) return new Response('Not found', { status: 404 }); }
  else if (u.role === 'shop') return new Response('Not found', { status: 404 });
  const data = await readDocument(d);
  const dl = new URL(req.url).searchParams.has('download');
  return new Response(new Uint8Array(data), { headers: {
    'Content-Type': d.mime, 'Content-Length': String(data.length), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${d.filename.replace(/[^\w.\- ]/g, '_')}"`,
  } });
}
