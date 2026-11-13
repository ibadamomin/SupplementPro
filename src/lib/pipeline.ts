import { draftSupplement, extractLinesWithAI, draftRebuttal } from './ai';
import type { User } from './auth';
import { newId, q, q1 } from './db';
import { fmtDateTime, usd } from './format';
import { getDocs, getItems, getJobRaw, getShop, logReview, playbookFor } from './jobs';
import { adminEmails, APP_NAME, APP_URL, sendMail, shopEmails } from './mailer';
import { buildPackage } from './package';
import { parseEstimatePdf, type EstimateLine } from './parser';
import { activeRules, libraryVersion, matchRules } from './rules';
import { deleteDocument, readDocument, saveDocument } from './storage';
import { decodeVin, vehicleLabel } from './vin';

// Upload -> parse -> checklist -> AI draft -> ready for an estimator.
export async function processJob(jobId: string): Promise<void> {
  try {
    const job = await getJobRaw(jobId);
    if (!job) return;
    const shop = (await getShop(job.shop_id))!;
    const docs = await getDocs(jobId);
    const est = docs.find((d) => d.kind === 'estimate');
    let lines: EstimateLine[] = [], rawText = '', pdf: Buffer | undefined, parseNote = '';
    if (est && est.mime === 'application/pdf') {
      pdf = await readDocument(est);
      try {
        const parsed = await parseEstimatePdf(pdf);
        lines = parsed.lines; rawText = parsed.text;
        const m = parsed.meta;
        await q(`UPDATE jobs SET vin = CASE WHEN vin = '' THEN $2 ELSE vin END, claim_number = CASE WHEN claim_number = '' THEN $3 ELSE claim_number END,
                 insurer = CASE WHEN insurer = '' THEN $4 ELSE insurer END, ro_number = CASE WHEN ro_number = '' THEN $5 ELSE ro_number END,
                 vehicle = CASE WHEN vehicle = '' THEN $6 ELSE vehicle END, estimate_total_cents = coalesce($7, estimate_total_cents) WHERE id = $1`,
          [jobId, m.vin, m.claim_number, m.insurer, m.ro_number, m.vehicle, m.total_cents]);
      } catch (e: any) { parseNote = `The estimate text could not be read (${String(e?.message || e).slice(0, 120)}).`; }
      if (lines.filter((l) => l.operation).length < 5) {
        const ai = await extractLinesWithAI(pdf);
        if (ai?.length) lines = ai;
        else if (!rawText.trim()) parseNote = 'No text could be read from the estimate (it may be a scan). Review the PDF and add items by hand.';
      }
    } else if (!est) parseNote = 'No estimate PDF was attached. Add items by hand or ask the shop for the estimate.';

    let cur = (await getJobRaw(jobId))!;
    if (cur.vin && !cur.vehicle_data?.make) {
      const v = await decodeVin(cur.vin);
      if (v) {
        await q(`UPDATE jobs SET vehicle_data = $2::jsonb, vehicle = CASE WHEN vehicle = '' THEN $3 ELSE vehicle END WHERE id = $1`, [jobId, JSON.stringify(v), vehicleLabel(v)]);
        cur = (await getJobRaw(jobId))!;
      }
    }
    await q('DELETE FROM estimate_lines WHERE job_id = $1', [jobId]);
    for (const l of lines) {
      await q(`INSERT INTO estimate_lines (job_id, line_no, section, operation, description, part_number, qty, price_cents, labor_hours, paint_hours, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [jobId, l.line_no, l.section, l.operation, l.description, l.part_number, l.qty, l.price_cents, l.labor_hours, l.paint_hours, l.raw]);
    }
    const rules = await activeRules();
    const candidates = matchRules(rules, lines, rawText, shop.rates);
    const photos = [];
    for (const d of docs.filter((d) => d.kind === 'photo').slice(0, 8)) photos.push({ label: d.label, jpeg: await readDocument(d) });
    const draft = await draftSupplement({
      shop: { name: shop.name, rates: shop.rates }, job: { insurer: cur.insurer, vehicle: cur.vehicle, vin: cur.vin, notes: cur.notes },
      lines, rawText, estimatePdf: pdf, photos, rules, candidates, playbook: await playbookFor(cur.insurer),
    });
    // On a re-run keep everything a person has touched; replace only untouched AI items.
    await q(`DELETE FROM flagged_items WHERE job_id = $1 AND origin = 'ai' AND status = 'pending'`, [jobId]);
    const kept = await getItems(jobId);
    let sort = kept.length;
    for (const it of draft.items) {
      if (kept.some((k) => (it.rule_id && k.rule_id === it.rule_id) || k.title.toLowerCase() === it.title.toLowerCase())) continue;
      await q(`INSERT INTO flagged_items (id, job_id, rule_id, title, category, reason, source, labor_hours, labor_type, amount_cents, origin, ai_snapshot, sort)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ai',$11::jsonb,$12)`,
        [newId(), jobId, it.rule_id, it.title, it.category, it.reason, it.source, it.labor_hours, it.labor_type, it.amount_cents, JSON.stringify(it), sort++]);
    }
    let assignee = cur.assigned_to;
    if (!assignee && process.env.AUTO_ASSIGN === 'true') {
      assignee = (await q1<{ id: string }>(`
        SELECT u.id FROM users u LEFT JOIN jobs j ON j.assigned_to = u.id AND j.status = 'in_review'
        WHERE u.role = 'estimator' AND u.active GROUP BY u.id ORDER BY count(j.id), u.created_at LIMIT 1`))?.id ?? null;
    }
    await q(`UPDATE jobs SET status = $2, error = $3, letter = CASE WHEN letter = '' THEN $4 ELSE letter END, drafted_at = now(),
             ai_meta = $5::jsonb, rules_version = $6, assigned_to = $7, assigned_at = CASE WHEN $7::text IS NOT NULL AND assigned_at IS NULL THEN now() ELSE assigned_at END WHERE id = $1`,
      [jobId, assignee ? 'in_review' : 'needs_review', [parseNote, draft.note].filter(Boolean).join(' '), draft.letter,
        JSON.stringify({ mode: draft.mode, model: draft.model ?? null, drafted: draft.items.length, lines: lines.length, photos: photos.length }), await libraryVersion(), assignee]);
    if (assignee) await notifyAssigned(jobId, assignee);
    else await sendMail({ to: await adminEmails(), jobId, subject: `Job #${cur.number} from ${shop.name} is waiting for an estimator`,
      text: `A new job has been drafted and needs to be assigned.\n\nShop: ${shop.name}\nVehicle: ${cur.vehicle || '-'}\nDue: ${fmtDateTime(cur.due_at)}\n\n${APP_URL}/jobs/${jobId}` });
  } catch (e: any) {
    console.error('[pipeline] job failed', jobId, e);
    await q(`UPDATE jobs SET status = 'failed', error = $2 WHERE id = $1`, [jobId, String(e?.message || e).slice(0, 500)]);
  }
}

export async function notifyAssigned(jobId: string, userId: string) {
  const job = (await getJobRaw(jobId))!;
  const u = await q1<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  if (u) await sendMail({ to: u.email, jobId, subject: `Job #${job.number} assigned to you — due ${fmtDateTime(job.due_at)}`,
    text: `A supplement draft is ready for your review.\n\nVehicle: ${job.vehicle || '-'}\nInsurer: ${job.insurer || '-'}\nDue: ${fmtDateTime(job.due_at)}\n\n${APP_URL}/jobs/${jobId}` });
}

// Estimator sign-off: build the package, store it, and send it to the shop.
export async function signOff(jobId: string, user: User): Promise<{ ok: boolean; error?: string }> {
  const items = await getItems(jobId);
  if (items.some((i) => i.status === 'pending')) return { ok: false, error: 'Approve or reject every item before signing off.' };
  const job = (await getJobRaw(jobId))!;
  for (const d of (await getDocs(jobId)).filter((d) => d.kind === 'package')) await deleteDocument(d);
  const approved = items.filter((i) => i.status === 'approved');
  let attachment: { filename: string; content: Buffer } | undefined, total = 0;
  if (approved.length) {
    const pkg = await buildPackage(jobId);
    await saveDocument({ jobId, kind: 'package', filename: pkg.filename, mime: 'application/pdf', data: pkg.pdf });
    attachment = { filename: pkg.filename, content: pkg.pdf }; total = pkg.total_cents;
  }
  // With nothing to supplement the job closes straight away.
  await q(`UPDATE jobs SET status = $3, signed_off_by = $2, signed_off_at = now(), closed_at = CASE WHEN $3 = 'closed' THEN now() ELSE NULL END WHERE id = $1`,
    [jobId, user.id, approved.length ? 'delivered' : 'closed']);
  await logReview(jobId, user.id, 'sign_off', null, null, { approved: approved.length, total_cents: total });
  await sendMail({
    to: await shopEmails(job.shop_id), jobId, attachment,
    subject: approved.length ? `Supplement ready: ${job.vehicle || 'Job #' + job.number} — ${usd(total)} to submit` : `Review complete: ${job.vehicle || 'Job #' + job.number} — nothing to supplement`,
    text: approved.length
      ? `Your supplement package is attached and ready to send to ${job.insurer || 'the insurer'}.\n\n${approved.length} operations, ${usd(total)} total.\nReviewed and signed off by ${user.name}${user.credentials ? ' (' + user.credentials + ')' : ''}.\n\n` +
        `Next steps:\n1. Review the package and add the operations to your estimate.\n2. Send it to the insurer from your shop.\n3. Mark what gets approved or denied here: ${APP_URL}/jobs/${jobId}\n\n— ${APP_NAME}`
      : `We reviewed this estimate and found no missed operations worth submitting.\n\nReviewed by ${user.name}.\n${APP_URL}/jobs/${jobId}\n\n— ${APP_NAME}`,
  });
  return { ok: true };
}

// A denial creates a rebuttal draft that waits for release by the admin or an estimator.
export async function createRebuttal(jobId: string, itemId: string, denialReason: string) {
  const job = (await getJobRaw(jobId))!;
  const item = (await getItems(jobId)).find((i) => i.id === itemId);
  if (!item) return;
  const body = await draftRebuttal({ shopName: job.shop_name, insurer: job.insurer, vehicle: job.vehicle, claim: job.claim_number,
    item, denialReason, playbook: await playbookFor(job.insurer) });
  await q(`DELETE FROM rebuttals WHERE flagged_item_id = $1 AND status = 'draft'`, [itemId]);
  await q('INSERT INTO rebuttals (id, job_id, flagged_item_id, body) VALUES ($1,$2,$3,$4)', [newId(), jobId, itemId, body]);
  await sendMail({ to: await adminEmails(), jobId, subject: `Denial on job #${job.number}: rebuttal draft ready to release`,
    text: `${job.shop_name} recorded a denial for "${item.title}" (${usd(item.amount_cents)}).\nReason: ${denialReason || 'not given'}\n\nReview and release the rebuttal: ${APP_URL}/admin/rebuttals` });
}

export async function closeIfComplete(jobId: string) {
  const items = (await getItems(jobId)).filter((i) => i.status === 'approved');
  if (items.length && items.every((i) => i.result)) await q(`UPDATE jobs SET status = 'closed', closed_at = now() WHERE id = $1 AND status IN ('delivered','submitted')`, [jobId]);
}
