import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { q, q1 } from './db';

export type Role = 'admin' | 'shop' | 'estimator';
export interface User {
  id: string; email: string; name: string; role: Role; shop_id: string | null;
  credentials: string; pay_per_job_cents: number;
}
const COOKIE = 'sd_session';
const DAYS = 30;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// Simple in-memory throttle: 8 failed attempts per email per 15 minutes.
const fails = new Map<string, { n: number; until: number }>();

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  email = email.trim().toLowerCase();
  const f = fails.get(email);
  if (f && f.n >= 8 && f.until > Date.now()) return { ok: false, error: 'Too many attempts. Try again in a few minutes.' };
  const u = await q1<{ id: string; password_hash: string; active: boolean }>('SELECT id, password_hash, active FROM users WHERE email = $1', [email]);
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60_000 };
    cur.n += 1; fails.set(email, cur);
    return { ok: false, error: 'Wrong email or password.' };
  }
  fails.delete(email);
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + DAYS * 86400_000);
  await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [sha(token), u.id, expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires,
    secure: process.env.NODE_ENV === 'production' && !(process.env.APP_URL || '').startsWith('http://'),
  });
  return { ok: true };
}

export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
  c.delete(COOKIE);
}

export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const u = await q1<User>(
    `SELECT u.id, u.email, u.name, u.role, u.shop_id, u.credentials, u.pay_per_job_cents
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [sha(token)]);
  return u ?? null;
});

export async function requireUser(...roles: Role[]): Promise<User> {
  const u = await getUser();
  if (!u) redirect('/login');
  if (roles.length && !roles.includes(u.role)) redirect('/');
  return u;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
