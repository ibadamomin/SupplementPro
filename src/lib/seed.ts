import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Driver } from './db';
import { SEED_RULES, SEED_PLAYBOOK } from './seed-rules';

const id = () => randomBytes(9).toString('base64url');

export async function seedIfEmpty(d: Driver) {
  const users = await d.query('SELECT count(*)::int AS n FROM users');
  if (users.rows[0].n === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      password = randomBytes(9).toString('base64url');
      console.log(`\n[setup] Created admin ${email} with password: ${password}\n[setup] Set ADMIN_EMAIL / ADMIN_PASSWORD in .env to choose your own.\n`);
    }
    await d.query(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'admin') ON CONFLICT (email) DO NOTHING`,
      [id(), email, bcrypt.hashSync(password, 10), 'Admin'],
    );
  }
  const rules = await d.query('SELECT count(*)::int AS n FROM rules');
  if (rules.rows[0].n === 0) {
    for (const r of SEED_RULES) {
      const rid = id();
      await d.query('INSERT INTO rules (id, code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING', [rid, r.code]);
      await d.query(
        `INSERT INTO rule_versions (rule_id, version, title, category, description, triggers, satisfied_by, labor_hours, labor_type, flat_amount_cents, source, change_note)
         SELECT id, 1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, 'Initial checklist' FROM rules WHERE code = $1
         ON CONFLICT (rule_id, version) DO NOTHING`,
        [r.code, r.title, r.category, r.description, JSON.stringify(r.triggers), JSON.stringify(r.satisfied_by), r.labor_hours, r.labor_type, r.flat_amount_cents, r.source],
      );
    }
    for (const p of SEED_PLAYBOOK) {
      await d.query('INSERT INTO playbook (id, insurer, topic, denial_pattern, response) VALUES ($1,$2,$3,$4,$5)', [id(), p.insurer, p.topic, p.denial_pattern, p.response]);
    }
  }
}
