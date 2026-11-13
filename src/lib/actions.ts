'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { hashPassword, login, logout, requireUser } from './auth';
import { newId, q, q1 } from './db';
import { CATEGORIES, LABOR_TYPES, PLANS, num, toCents } from './format';
import { addPhoto } from './intake';
import { canReview, getItems, getJobFor, getShop, logReview, type Item } from './jobs';
import { APP_URL, sendMail, shopEmails } from './mailer';
import { closeIfComplete, createRebuttal, notifyAssigned, processJob, signOff } from './pipeline';
import { amountFor, getRule } from './rules';
import { deleteDocument, saveDocument, type Doc } from './storage';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
function back(path: string, msg?: string, err?: boolean): never {
  redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}${err ? 'error' : 'ok'}=${encodeURIComponent(msg)}` : path);
}

// ---------- session ----------
export async function loginAction(fd: FormData) {
  const r = await login(S(fd, 'email'), S(fd, 'password'));
  if (!r.ok) back('/login', r.error, true);
  redirect('/');
}
export async function logoutAction() { await logout(); redirect('/login'); }
export async function changePassword(fd: FormData) {
  const u = await requireUser();
  const pw = S(fd, 'password');
  if (pw.length < 10) back('/settings', 'Use at least 10 characters.', true);
  await q('UPDATE users SET password_hash = $2 WHERE id = $1', [u.id, await hashPassword(pw)]);
  back('/settings', 'Password updated.');
}

// ---------- shops and team (admin) ----------
function shopFields(fd: FormData) {
  const plan = PLANS[S(fd, 'plan')] ? S(fd, 'plan') : 'starter';
  return [
    S(fd, 'name'), S(fd, 'contact_name'), S(fd, 'phone'), S(fd, 'address'), plan,
    fd.get('monthly_fee') ? toCents(fd.get('monthly_fee')) : PLANS[plan].fee, fd.get('job_cap') ? Math.max(0, Math.round(num(fd.get('job_cap')))) : PLANS[plan].cap,
    JSON.stringify(Object.fromEntries(LABOR_TYPES.map((t) => [t, num(fd.get('rate_' + t)) || undefined]))),
    JSON.stringify(list(S(fd, 'insurers'))), S(fd, 'notes'),
  ];
}
export async function createShop(fd: FormData) {
  await requireUser('admin');
  if (!S(fd, 'name')) back('/admin/shops', 'Shop name is required.', true);
  const id = newId();
  await q(`INSERT INTO shops (id, intake_token, name, contact_name, phone, address, plan, monthly_fee_cents, job_cap, rates, insurers, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)`, [id, randomBytes(6).toString('hex'), ...shopFields(fd)]);
  redirect(`/admin/shops/${id}`);
}
export async function updateShop(fd: FormData) {
  await requireUser('admin');
  const id = S(fd, 'id');
  await q(`UPDATE shops SET name=$2, contact_name=$3, phone=$4, address=$5, plan=$6, monthly_fee_cents=$7, job_cap=$8, rates=$9::jsonb, insurers=$10::jsonb, notes=$11, active=$12 WHERE id=$1`,
    [id, ...shopFields(fd), fd.get('active') === 'on']);
  back(`/admin/shops/${id}`, 'Shop saved.');
}
export async function createUser(fd: FormData) {
  await requireUser('admin');
  const role = S(fd, 'role'), email = S(fd, 'email').toLowerCase(), pw = S(fd, 'password'), ret = S(fd, 'return') || '/admin/team';
  if (!['admin', 'shop', 'estimator'].includes(role) || !email.includes('@') || !S(fd, 'name')) back(ret, 'Name, email and role are required.', true);
  if (pw.length < 10) back(ret, 'Temporary password must be at least 10 characters.', true);
  if (role === 'shop' && !S(fd, 'shop_id')) back(ret, 'Choose a shop for this user.', true);
  if (await q1('SELECT 1 FROM users WHERE email = $1', [email])) back(ret, 'That email is already in use.', true);
  await q(`INSERT INTO users (id, email, password_hash, name, role, shop_id, credentials, pay_per_job_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [newId(), email, await hashPassword(pw), S(fd, 'name'), role, role === 'shop' ? S(fd, 'shop_id') : null, S(fd, 'credentials'), toCents(fd.get('pay_per_job'))]);
  await sendMail({ to: email, subject: 'Your account is ready', text: `Hi ${S(fd, 'name')},\n\nAn account has been created for you.\n\nSign in: ${APP_URL}/login\nEmail: ${email}\nTemporary password: ${pw}\n\nPlease change your password under Settings after signing in.` });
  back(ret, 'User created. Their sign-in details were emailed (see Outbox if email is not set up).');
}
export async function updateUser(fd: FormData) {
  const me = await requireUser('admin');
  const id = S(fd, 'id'), ret = S(fd, 'return') || '/admin/team';
  const active = fd.get('active') === 'on' || id === me.id;
  await q('UPDATE users SET name=$2, credentials=$3, pay_per_job_cents=$4, active=$5 WHERE id=$1', [id, S(fd, 'name'), S(fd, 'credentials'), toCents(fd.get('pay_per_job')), active]);
  if (!active) await q('DELETE FROM sessions WHERE user_id = $1', [id]);
  const pw = S(fd, 'password');
  if (pw) {
    if (pw.length < 10) back(ret, 'New password must be at least 10 characters.', true);
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [id, await hashPassword(pw)]);
    await q('DELETE FROM sessions WHERE user_id = $1 AND user_id <> $2', [id, me.id]);
  }
  back(ret, 'User saved.');
}

// ---------- jobs ----------
export async function assignJob(fd: FormData) {
  await requireUser('admin');
  const id = S(fd, 'job_id'), userId = S(fd, 'user_id') || null;
  await q(`UPDATE jobs SET assigned_to = $2, assigned_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
           status = CASE WHEN status IN ('needs_review','in_review') THEN (CASE WHEN $2::text IS NULL THEN 'needs_review' ELSE 'in_review' END) ELSE status END WHERE id = $1`, [id, userId]);
  if (userId) await notifyAssigned(id, userId);
  revalidatePath(`/jobs/${id}`);
}
export async function reprocessJob(fd: FormData) {
  const u = await requireUser('admin', 'estimator');
  const job = await getJobFor(u, S(fd, 'job_id'));
  if (!job || !['failed', 'needs_review', 'in_review', 'processing'].includes(job.status)) return;
  await q(`UPDATE jobs SET status = 'processing', error = '' WHERE id = $1`, [job.id]);
  after(() => processJob(job.id));
  revalidatePath(`/jobs/${job.id}`);
}
export async function updateJobDetails(fd: FormData) {
  const u = await requireUser();
  const job = await getJobFor(u, S(fd, 'job_id'));
  if (!job || ['delivered', 'submitted', 'closed'].includes(job.status)) return;
  await q('UPDATE jobs SET ro_number=$2, insurer=$3, claim_number=$4, adjuster=$5, vin=$6, vehicle=$7 WHERE id=$1',
    [job.id, S(fd, 'ro_number'), S(fd, 'insurer'), S(fd, 'claim_number'), S(fd, 'adjuster'), S(fd, 'vin').toUpperCase(), S(fd, 'vehicle')]);
  back(`/jobs/${job.id}`, 'Details saved.');
}
export async function addPhotos(fd: FormData) {
  const u = await requireUser();
  const job = await getJobFor(u, S(fd, 'job_id'));
  if (!job || ['delivered', 'submitted', 'closed'].includes(job.status)) return;
  let bad = 0;
  for (const f of fd.getAll('photos')) {
    if (!(f instanceof File) || !f.size) continue;
    try { await addPhoto(job.id, f.name, Buffer.from(await f.arrayBuffer()), S(fd, 'label')); } catch { bad++; }
  }
  back(`/jobs/${job.id}`, bad ? `${bad} file(s) were not valid images and were skipped.` : 'Photos added.', bad > 0);
}
export async function setPhotoLabel(fd: FormData) {
  const u = await requireUser();
  const d = await q1<Doc>(`SELECT * FROM documents WHERE id = $1 AND kind = 'photo'`, [S(fd, 'doc_id')]);
  if (!d?.job_id || !(await getJobFor(u, d.job_id))) return;
  await q('UPDATE documents SET label = $2 WHERE id = $1', [d.id, S(fd, 'label').slice(0, 120)]);
  revalidatePath(`/jobs/${d.job_id}`);
}

// ---------- review ----------
const snap = (i: Item) => ({ title: i.title, category: i.category, reason: i.reason, source: i.source, labor_hours: i.labor_hours, labor_type: i.labor_type, amount_cents: i.amount_cents, status: i.status });
async function reviewJob(fd: FormData) {
  const u = await requireUser('admin', 'estimator');
  const job = await getJobFor(u, S(fd, 'job_id'));
  if (!job || !canReview(u, job)) redirect('/jobs');
  return { u, job: job! };
}
export async function itemAction(fd: FormData) {
  const { u, job } = await reviewJob(fd);
  const item = (await getItems(job.id)).find((i) => i.id === S(fd, 'item_id'));
  if (!item) return;
  const intent = S(fd, 'intent');
  if (intent === 'delete') {
    if (item.origin !== 'estimator') return;
    await q('DELETE FROM flagged_items WHERE id = $1', [item.id]);
    await logReview(job.id, u.id, 'delete', item.id, snap(item), null);
  } else {
    const next = {
      title: S(fd, 'title') || item.title, category: (CATEGORIES as readonly string[]).includes(S(fd, 'category')) ? S(fd, 'category') : item.category,
      reason: S(fd, 'reason'), source: S(fd, 'source'), labor_hours: Math.max(0, num(fd.get('labor_hours'))),
      labor_type: (LABOR_TYPES as readonly string[]).includes(S(fd, 'labor_type')) ? S(fd, 'labor_type') : item.labor_type,
      amount_cents: Math.max(0, toCents(fd.get('amount'))),
      status: intent === 'approve' ? 'approved' : intent === 'reject' ? 'rejected' : intent === 'undo' ? 'pending' : item.status,
    };
    const before = snap(item);
    const edited = (['title', 'category', 'reason', 'source', 'labor_hours', 'labor_type', 'amount_cents'] as const).some((k) => String(before[k]) !== String(next[k]));
    await q(`UPDATE flagged_items SET title=$2, category=$3, reason=$4, source=$5, labor_hours=$6, labor_type=$7, amount_cents=$8, status=$9, updated_at=now() WHERE id=$1`,
      [item.id, next.title, next.category, next.reason, next.source, next.labor_hours, next.labor_type, next.amount_cents, next.status]);
    if (edited) await logReview(job.id, u.id, 'edit', item.id, before, next);
    if (before.status !== next.status) await logReview(job.id, u.id, intent, item.id, { status: before.status }, { status: next.status });
  }
  revalidatePath(`/jobs/${job.id}`);
}
export async function addItem(fd: FormData) {
  const { u, job } = await reviewJob(fd);
  const rule = S(fd, 'rule_id') ? await getRule(S(fd, 'rule_id')) : undefined;
  const shop = (await getShop(job.shop_id))!;
  const title = S(fd, 'title') || rule?.title;
  if (!title) back(`/jobs/${job.id}`, 'Give the item a title or pick a rule.', true);
  const labor_hours = fd.get('labor_hours') ? Math.max(0, num(fd.get('labor_hours'))) : rule?.labor_hours ?? 0;
  const labor_type = (LABOR_TYPES as readonly string[]).includes(S(fd, 'labor_type')) && (S(fd, 'labor_hours') || !rule) ? S(fd, 'labor_type') : rule?.labor_type ?? 'body';
  const amount = S(fd, 'amount') ? toCents(fd.get('amount')) : amountFor({ labor_hours, labor_type, flat_amount_cents: rule?.flat_amount_cents ?? 0 }, shop.rates);
  const item = { title, category: rule?.category ?? 'other', reason: S(fd, 'reason') || rule?.description || '', source: S(fd, 'source') || rule?.source || '', labor_hours, labor_type, amount_cents: amount };
  const id = newId();
  await q(`INSERT INTO flagged_items (id, job_id, rule_id, title, category, reason, source, labor_hours, labor_type, amount_cents, origin, status, sort)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'estimator','approved',(SELECT coalesce(max(sort),0)+1 FROM flagged_items WHERE job_id = $2))`,
    [id, job.id, rule?.rule_id ?? null, item.title, item.category, item.reason, item.source, item.labor_hours, item.labor_type, item.amount_cents]);
  await logReview(job.id, u.id, 'add', id, null, item);
  revalidatePath(`/jobs/${job.id}`);
}
export async function saveLetter(fd: FormData) {
  const { u, job } = await reviewJob(fd);
  await q('UPDATE jobs SET letter = $2 WHERE id = $1', [job.id, S(fd, 'letter')]);
  await logReview(job.id, u.id, 'letter_edit', null, { letter: job.letter }, { letter: S(fd, 'letter') });
  back(`/jobs/${job.id}`, 'Cover note saved.');
}
export async function signOffAction(fd: FormData) {
  const { u, job } = await reviewJob(fd);
  if (fd.has('letter')) await q('UPDATE jobs SET letter = $2 WHERE id = $1', [job.id, S(fd, 'letter')]);
  const r = await signOff(job.id, u);
  back(`/jobs/${job.id}`, r.ok ? 'Signed off. The package was sent to the shop.' : r.error, !r.ok);
}
export async function reopenJob(fd: FormData) {
  const u = await requireUser('admin');
  const job = await getJobFor(u, S(fd, 'job_id'));
  if (!job || !['delivered', 'closed'].includes(job.status) || job.submitted_at) return;
  await q(`UPDATE jobs SET status = $2, signed_off_at = NULL, signed_off_by = NULL, closed_at = NULL WHERE id = $1`, [job.id, job.assigned_to ? 'in_review' : 'needs_review']);
  await logReview(job.id, u.id, 'reopen', null, null, null);
  back(`/jobs/${job.id}`, 'Job reopened for review.');
}

// ---------- outcomes (shop) ----------
async function outcomeJob(fd: FormData) {
  const u = await requireUser('admin', 'shop');
  const job = await getJobFor(u, S(fd, 'job_id'));
  if (!job || !['delivered', 'submitted', 'closed'].includes(job.status)) redirect('/jobs');
  return { u, job: job! };
}
export async function markSubmitted(fd: FormData) {
  const { job } = await outcomeJob(fd);
  await q(`UPDATE jobs SET status = 'submitted', submitted_at = now() WHERE id = $1 AND status = 'delivered'`, [job.id]);
  back(`/jobs/${job.id}`, 'Marked as submitted. Record each result as the insurer responds.');
}
export async function recordOutcome(fd: FormData) {
  const { u, job } = await outcomeJob(fd);
  const item = (await getItems(job.id)).find((i) => i.id === S(fd, 'item_id') && i.status === 'approved');
  if (!item) return;
  const result = S(fd, 'result');
  if (result === 'clear') {
    await q('DELETE FROM outcomes WHERE flagged_item_id = $1', [item.id]);
    await q(`DELETE FROM rebuttals WHERE flagged_item_id = $1 AND status = 'draft'`, [item.id]);
    await q(`UPDATE jobs SET status = 'submitted', closed_at = NULL WHERE id = $1 AND status = 'closed'`, [job.id]);
  } else if (['approved', 'partial', 'denied'].includes(result)) {
    const partial = Math.min(item.amount_cents, Math.max(0, toCents(fd.get('approved_amount'))));
    const final = result === 'partial' && partial === item.amount_cents ? 'approved' : result === 'partial' && partial === 0 ? 'denied' : result;
    const cents = final === 'approved' ? item.amount_cents : final === 'partial' ? partial : 0;
    const reason = final === 'approved' ? '' : S(fd, 'denial_reason');
    await q(`INSERT INTO outcomes (flagged_item_id, job_id, result, approved_cents, denial_reason, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (flagged_item_id) DO UPDATE SET result = $3, approved_cents = $4, denial_reason = $5, recorded_by = $6, recorded_at = now()`,
      [item.id, job.id, final, cents, reason, u.id]);
    await q(`UPDATE jobs SET status = 'submitted', submitted_at = coalesce(submitted_at, now()) WHERE id = $1 AND status = 'delivered'`, [job.id]);
    if (final === 'denied' || final === 'partial') after(() => createRebuttal(job.id, item.id, reason));
    else await q(`DELETE FROM rebuttals WHERE flagged_item_id = $1 AND status = 'draft'`, [item.id]);
    await closeIfComplete(job.id);
  }
  revalidatePath(`/jobs/${job.id}`);
}
export async function approveAllOutcomes(fd: FormData) {
  const { u, job } = await outcomeJob(fd);
  for (const i of (await getItems(job.id)).filter((i) => i.status === 'approved' && !i.result)) {
    await q(`INSERT INTO outcomes (flagged_item_id, job_id, result, approved_cents, recorded_by) VALUES ($1,$2,'approved',$3,$4) ON CONFLICT (flagged_item_id) DO NOTHING`, [i.id, job.id, i.amount_cents, u.id]);
  }
  await q(`UPDATE jobs SET submitted_at = coalesce(submitted_at, now()), status = 'submitted' WHERE id = $1 AND status = 'delivered'`, [job.id]);
  await closeIfComplete(job.id);
  back(`/jobs/${job.id}`, 'All remaining items marked approved.');
}

// ---------- rebuttals ----------
export async function rebuttalAction(fd: FormData) {
  const u = await requireUser('admin', 'estimator');
  const r = await q1<any>('SELECT r.*, j.shop_id, j.number, j.assigned_to, f.title FROM rebuttals r JOIN jobs j ON j.id = r.job_id JOIN flagged_items f ON f.id = r.flagged_item_id WHERE r.id = $1', [S(fd, 'id')]);
  if (!r || (u.role === 'estimator' && r.assigned_to !== u.id)) return;
  const intent = S(fd, 'intent');
  if (intent === 'discard') await q('DELETE FROM rebuttals WHERE id = $1', [r.id]);
  else {
    await q('UPDATE rebuttals SET body = $2 WHERE id = $1', [r.id, S(fd, 'body')]);
    if (intent === 'release') {
      await q(`UPDATE rebuttals SET status = 'released', released_by = $2, released_at = now() WHERE id = $1`, [r.id, u.id]);
      await sendMail({ to: await shopEmails(r.shop_id), jobId: r.job_id, subject: `Rebuttal ready for "${r.title}" (job #${r.number})`,
        text: `A rebuttal for the denied operation is ready for you to send to the insurer.\n\n${S(fd, 'body')}\n\nView it here: ${APP_URL}/jobs/${r.job_id}` });
    }
  }
  revalidatePath('/admin/rebuttals'); revalidatePath(`/jobs/${r.job_id}`);
}

// ---------- rules library ----------
export async function saveRule(fd: FormData) {
  const u = await requireUser('admin');
  let id = S(fd, 'id');
  const code = S(fd, 'code').toUpperCase().replace(/[^A-Z0-9-]/g, '-');
  if (!S(fd, 'title')) back(id ? `/admin/rules/${id}` : '/admin/rules', 'Title is required.', true);
  if (!id) {
    if (!code || (await q1('SELECT 1 FROM rules WHERE code = $1', [code]))) back('/admin/rules', 'Give the rule a unique code.', true);
    id = newId();
    await q('INSERT INTO rules (id, code) VALUES ($1,$2)', [id, code]);
  }
  await q(`INSERT INTO rule_versions (rule_id, version, title, category, description, triggers, satisfied_by, labor_hours, labor_type, flat_amount_cents, source, change_note, created_by)
           VALUES ($1, (SELECT coalesce(max(version),0)+1 FROM rule_versions WHERE rule_id = $1), $2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12)`,
    [id, S(fd, 'title'), (CATEGORIES as readonly string[]).includes(S(fd, 'category')) ? S(fd, 'category') : 'other', S(fd, 'description'),
      JSON.stringify(list(S(fd, 'triggers'))), JSON.stringify(list(S(fd, 'satisfied_by'))), Math.max(0, num(fd.get('labor_hours'))),
      (LABOR_TYPES as readonly string[]).includes(S(fd, 'labor_type')) ? S(fd, 'labor_type') : 'body', toCents(fd.get('flat_amount')), S(fd, 'source'), S(fd, 'change_note'), u.id]);
  back(`/admin/rules/${id}`, 'Saved as a new version.');
}
export async function toggleRuleArchived(fd: FormData) {
  await requireUser('admin');
  await q('UPDATE rules SET archived = NOT archived WHERE id = $1', [S(fd, 'id')]);
  revalidatePath('/admin/rules'); revalidatePath(`/admin/rules/${S(fd, 'id')}`);
}
export async function uploadRuleDoc(fd: FormData) {
  await requireUser('admin');
  const id = S(fd, 'id'), f = fd.get('file');
  if (!(f instanceof File) || !f.size) back(`/admin/rules/${id}`, 'Choose a file.', true);
  const file = f as File, data = Buffer.from(await file.arrayBuffer());
  const mime = data.subarray(0, 5).toString('latin1') === '%PDF-' ? 'application/pdf' : data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : data.subarray(1, 4).toString('latin1') === 'PNG' ? 'image/png' : '';
  if (!mime) back(`/admin/rules/${id}`, 'Attach a PDF, JPEG or PNG.', true);
  await saveDocument({ ruleId: id, kind: 'reference', filename: file.name, mime, data });
  back(`/admin/rules/${id}`, 'Document attached. It will be appended to packages that use this rule.');
}
export async function deleteRuleDoc(fd: FormData) {
  await requireUser('admin');
  const d = await q1<Doc>(`SELECT * FROM documents WHERE id = $1 AND rule_id IS NOT NULL`, [S(fd, 'doc_id')]);
  if (d) { await deleteDocument(d); revalidatePath(`/admin/rules/${d.rule_id}`); }
}
export async function savePlaybook(fd: FormData) {
  await requireUser('admin');
  if (!S(fd, 'insurer') || !S(fd, 'topic')) back('/admin/playbook', 'Insurer and topic are required.', true);
  if (S(fd, 'id')) await q('UPDATE playbook SET insurer=$2, topic=$3, denial_pattern=$4, response=$5, updated_at=now() WHERE id=$1', [S(fd, 'id'), S(fd, 'insurer'), S(fd, 'topic'), S(fd, 'denial_pattern'), S(fd, 'response')]);
  else await q('INSERT INTO playbook (id, insurer, topic, denial_pattern, response) VALUES ($1,$2,$3,$4,$5)', [newId(), S(fd, 'insurer'), S(fd, 'topic'), S(fd, 'denial_pattern'), S(fd, 'response')]);
  back('/admin/playbook', 'Saved.');
}
export async function deletePlaybook(fd: FormData) {
  await requireUser('admin');
  await q('DELETE FROM playbook WHERE id = $1', [S(fd, 'id')]);
  revalidatePath('/admin/playbook');
}
