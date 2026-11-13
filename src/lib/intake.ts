import { newId, q } from './db';
import { saveDocument } from './storage';

export const MAX_ESTIMATE = 25 * 1024 * 1024, MAX_PHOTO = 15 * 1024 * 1024, MAX_PHOTOS = 30;
export const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

// Photos are normalised to upright JPEGs no larger than 2000px so they are small,
// safe to embed in the package PDF and accepted by the AI model.
export async function normalisePhoto(data: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(data).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}
export async function addPhoto(jobId: string, filename: string, data: Buffer, label = '') {
  const jpeg = await normalisePhoto(data);
  return saveDocument({ jobId, kind: 'photo', filename: filename.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: jpeg, label });
}

export interface NewJob {
  shopId: string; userId?: string | null; source: 'upload' | 'email';
  ro_number?: string; insurer?: string; claim_number?: string; adjuster?: string; vin?: string; vehicle?: string; notes?: string;
  estimate?: { filename: string; data: Buffer };
  photos?: { filename: string; data: Buffer; label?: string }[];
}
export async function createJob(n: NewJob): Promise<{ id: string; skipped: string[] }> {
  if (n.estimate && !isPdf(n.estimate.data)) throw new Error('The estimate must be a PDF file.');
  if (n.estimate && n.estimate.data.length > MAX_ESTIMATE) throw new Error('The estimate PDF is larger than 25 MB.');
  const id = newId();
  await q(`INSERT INTO jobs (id, shop_id, created_by, source, ro_number, insurer, claim_number, adjuster, vin, vehicle, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, n.shopId, n.userId ?? null, n.source, (n.ro_number ?? '').slice(0, 40), (n.insurer ?? '').slice(0, 80), (n.claim_number ?? '').slice(0, 40),
      (n.adjuster ?? '').slice(0, 80), (n.vin ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17), (n.vehicle ?? '').slice(0, 120), (n.notes ?? '').slice(0, 4000)]);
  if (n.estimate) await saveDocument({ jobId: id, kind: 'estimate', filename: n.estimate.filename || 'estimate.pdf', mime: 'application/pdf', data: n.estimate.data });
  const skipped: string[] = [];
  for (const p of (n.photos ?? []).slice(0, MAX_PHOTOS)) {
    if (p.data.length > MAX_PHOTO) { skipped.push(p.filename); continue; }
    try { await addPhoto(id, p.filename, p.data, p.label); } catch { skipped.push(p.filename); }
  }
  return { id, skipped };
}
