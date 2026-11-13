import { q } from './db';

export const APP_NAME = process.env.APP_NAME || 'Supplement Desk';
export const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function sendMail(o: { to: string | string[]; subject: string; text: string; attachment?: { filename: string; content: Buffer }; jobId?: string }) {
  const to = (Array.isArray(o.to) ? o.to : [o.to]).filter(Boolean);
  if (!to.length) return;
  let status = 'logged', error = '';
  if (process.env.SMTP_URL) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      await nodemailer.createTransport(process.env.SMTP_URL).sendMail({
        from: process.env.MAIL_FROM || `${APP_NAME} <no-reply@localhost>`, to: to.join(', '), subject: o.subject, text: o.text,
        attachments: o.attachment ? [{ filename: o.attachment.filename, content: o.attachment.content }] : [],
      });
      status = 'sent';
    } catch (e: any) { status = 'failed'; error = String(e?.message || e).slice(0, 500); console.error('[mail] send failed:', error); }
  }
  await q('INSERT INTO emails (recipient, subject, body, attachment, status, error, job_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [to.join(', '), o.subject, o.text, o.attachment?.filename ?? '', status, error, o.jobId ?? null]);
}
export const adminEmails = async () => (await q<{ email: string }>(`SELECT email FROM users WHERE role = 'admin' AND active`)).map((r) => r.email);
export const shopEmails = async (shopId: string) => (await q<{ email: string }>(`SELECT email FROM users WHERE role = 'shop' AND shop_id = $1 AND active`, [shopId])).map((r) => r.email);
