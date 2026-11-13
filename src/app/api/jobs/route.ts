import { after, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createJob, MAX_PHOTOS } from '@/lib/intake';
import { getShop } from '@/lib/jobs';
import { processJob } from '@/lib/pipeline';

export const maxDuration = 300;

export async function POST(req: Request) {
  const u = await getUser();
  if (!u || u.role === 'estimator') return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  // Same-origin check: this endpoint is only called by the app's own upload form.
  const origin = req.headers.get('origin'), host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: 'Bad origin.' }, { status: 403 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 }); }
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const shopId = u.role === 'admin' ? s('shop_id') : u.shop_id!;
  const shop = shopId ? await getShop(shopId) : undefined;
  if (!shop || !shop.active) return NextResponse.json({ error: 'Choose a shop.' }, { status: 400 });
  const est = fd.get('estimate');
  if (!(est instanceof File) || !est.size) return NextResponse.json({ error: 'Attach the insurer estimate as a PDF.' }, { status: 400 });
  const photos = fd.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) return NextResponse.json({ error: `Attach at most ${MAX_PHOTOS} photos.` }, { status: 400 });
  try {
    const { id } = await createJob({
      shopId, userId: u.id, source: 'upload', ro_number: s('ro_number'), insurer: s('insurer'), claim_number: s('claim_number'),
      adjuster: s('adjuster'), vin: s('vin'), notes: s('notes'),
      estimate: { filename: est.name, data: Buffer.from(await est.arrayBuffer()) },
      photos: await Promise.all(photos.map(async (p) => ({ filename: p.name, data: Buffer.from(await p.arrayBuffer()) }))),
    });
    after(() => processJob(id));
    return NextResponse.json({ id });
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Upload failed.' }, { status: 400 }); }
}
