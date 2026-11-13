import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { q, q1 } from '@/lib/db';
import { createJob, isPdf } from '@/lib/intake';
import { processJob } from '@/lib/pipeline';

// Inbound email webhook (Postmark inbound JSON format). Each shop forwards estimates to
// intake+<token>@<INBOUND_EMAIL_DOMAIN>; the first PDF becomes the estimate, images become photos.
export async function POST(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET || '';
  const url = new URL(req.url);
  const basic = (req.headers.get('authorization') || '').replace(/^Basic\s+/i, '');
  const given = url.searchParams.get('secret') || (basic ? Buffer.from(basic, 'base64').toString().split(':').pop()! : '');
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response('Unauthorized', { status: 401 });
  let m: any;
  try { m = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const recipients: string[] = [m.OriginalRecipient, m.To, ...(m.ToFull ?? []).map((t: any) => t.Email)].filter(Boolean).join(',').split(',').map((s: string) => s.trim().toLowerCase());
  const token = (m.MailboxHash || recipients.map((r) => r.match(/\+([a-z0-9]+)@/)?.[1]).find(Boolean) || '').toLowerCase();
  const shop = token ? await q1<{ id: string; active: boolean }>('SELECT id, active FROM shops WHERE intake_token = $1', [token]) : undefined;
  const from = String(m.FromFull?.Email || m.From || ''), subject = String(m.Subject || '');
  const log = (status: string, error = '', jobId: string | null = null) =>
    q(`INSERT INTO emails (direction, recipient, subject, body, status, error, job_id) VALUES ('in',$1,$2,$3,$4,$5,$6)`, [from, subject, String(m.TextBody || '').slice(0, 2000), status, error, jobId]);
  // Always answer 200 for handled cases so the provider does not retry forever.
  if (!shop || !shop.active) { await log('rejected', 'No active shop matches the intake address'); return Response.json({ ok: false, reason: 'unknown shop' }); }
  const files = (m.Attachments ?? []).map((a: any) => ({ filename: String(a.Name || 'file'), type: String(a.ContentType || ''), data: Buffer.from(String(a.Content || ''), 'base64') }));
  const estimate = files.find((f: any) => isPdf(f.data));
  const photos = files.filter((f: any) => /^image\/(jpeg|png|webp)/.test(f.type));
  if (!estimate) { await log('rejected', 'No PDF estimate attached'); return Response.json({ ok: false, reason: 'no estimate' }); }
  try {
    const { id } = await createJob({ shopId: shop.id, source: 'email', ro_number: subject.match(/\bRO\s*#?\s*([A-Z0-9-]+)/i)?.[1] ?? '',
      notes: [subject, String(m.TextBody || '').trim()].filter(Boolean).join('\n\n').slice(0, 4000), estimate, photos });
    await log('received', '', id);
    after(() => processJob(id));
    return Response.json({ ok: true, id });
  } catch (e: any) { await log('rejected', String(e?.message || e)); return Response.json({ ok: false, reason: 'invalid attachment' }); }
}
