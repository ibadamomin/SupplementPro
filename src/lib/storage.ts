import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, newId, q, q1 } from './db';

// Every file is encrypted with AES-256-GCM before it is written to disk or to the bucket.
// Layout: 12-byte IV | 16-byte auth tag | ciphertext.
let key: Buffer | undefined;
function getKey(): Buffer {
  if (key) return key;
  const env = process.env.FILE_ENCRYPTION_KEY;
  if (env) {
    key = Buffer.from(env, 'base64');
    if (key.length !== 32) throw new Error('FILE_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    return key;
  }
  if (process.env.NODE_ENV === 'production' && process.env.GCS_BUCKET) {
    throw new Error('FILE_ENCRYPTION_KEY is required when storing files in a bucket');
  }
  const file = path.join(DATA_DIR, '.filekey');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  return key;
}
export function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', getKey(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
export function decrypt(blob: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', getKey(), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

async function bucket() {
  const { Storage } = await import('@google-cloud/storage');
  return new Storage().bucket(process.env.GCS_BUCKET!);
}
const localPath = (k: string) => path.join(DATA_DIR, 'files', k);

async function put(storageKey: string, data: Buffer) {
  const blob = encrypt(data);
  if (process.env.GCS_BUCKET) {
    await (await bucket()).file(storageKey).save(blob, { resumable: false, contentType: 'application/octet-stream' });
  } else {
    fs.mkdirSync(path.dirname(localPath(storageKey)), { recursive: true });
    await fs.promises.writeFile(localPath(storageKey), blob);
  }
}
async function get(storageKey: string): Promise<Buffer> {
  if (process.env.GCS_BUCKET) {
    const [buf] = await (await bucket()).file(storageKey).download();
    return decrypt(buf);
  }
  return decrypt(await fs.promises.readFile(localPath(storageKey)));
}
async function remove(storageKey: string) {
  if (process.env.GCS_BUCKET) await (await bucket()).file(storageKey).delete({ ignoreNotFound: true });
  else await fs.promises.rm(localPath(storageKey), { force: true });
}

export interface Doc {
  id: string; job_id: string | null; rule_id: string | null; kind: string;
  filename: string; mime: string; size: number; storage_key: string; label: string; created_at: Date;
}
export async function saveDocument(o: { jobId?: string; ruleId?: string; kind: string; filename: string; mime: string; data: Buffer; label?: string }): Promise<Doc> {
  const id = newId();
  const storageKey = `${o.jobId ? 'jobs/' + o.jobId : 'rules/' + o.ruleId}/${id}`;
  await put(storageKey, o.data);
  await q(`INSERT INTO documents (id, job_id, rule_id, kind, filename, mime, size, storage_key, label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, o.jobId ?? null, o.ruleId ?? null, o.kind, o.filename.slice(0, 200), o.mime, o.data.length, storageKey, o.label ?? '']);
  return (await q1<Doc>('SELECT * FROM documents WHERE id = $1', [id]))!;
}
export const readDocument = (d: Doc) => get(d.storage_key);
export async function deleteDocument(d: Doc) {
  await remove(d.storage_key);
  await q('DELETE FROM documents WHERE id = $1', [d.id]);
}
