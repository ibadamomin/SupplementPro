// Creates a demo shop, a shop user, an estimator and two drafted jobs so you can click
// through the whole flow. Run it while the app is stopped (the embedded database allows
// one process at a time), or point DATABASE_URL at Postgres.
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { newId, q, q1 } from '../src/lib/db';
import { createJob } from '../src/lib/intake';
import { processJob } from '../src/lib/pipeline';
import { sampleEstimate } from './make-sample-estimate';

const PASSWORD = process.env.DEMO_PASSWORD || 'demo-password-123';
async function user(email: string, name: string, role: string, extra: Record<string, unknown> = {}) {
  if (await q1('SELECT 1 FROM users WHERE email = $1', [email])) return;
  await q(`INSERT INTO users (id, email, password_hash, name, role, shop_id, credentials, pay_per_job_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [newId(), email, bcrypt.hashSync(PASSWORD, 10), name, role, extra.shop_id ?? null, extra.credentials ?? '', extra.pay ?? 0]);
}
const photo = (label: string, color: string) => sharp({ create: { width: 1200, height: 900, channels: 3, background: color } })
  .composite([{ input: Buffer.from(`<svg width="1200" height="900"><text x="60" y="120" font-size="54" font-family="sans-serif" fill="white">Sample photo: ${label}</text></svg>`) }]).jpeg().toBuffer();

(async () => {
  let shop = await q1<{ id: string }>(`SELECT id FROM shops WHERE name = 'Lone Star Collision (demo)'`);
  if (!shop) {
    shop = { id: newId() };
    await q(`INSERT INTO shops (id, intake_token, name, contact_name, phone, address, plan, monthly_fee_cents, job_cap, rates, insurers)
             VALUES ($1,'demo01','Lone Star Collision (demo)','Ray Delgado','(512) 555-0142','1200 Example Rd, Leander, TX 78641','founding',40000,20,$2::jsonb,$3::jsonb)`,
      [shop.id, JSON.stringify({ body: 58, refinish: 58, mechanical: 115, frame: 75 }), JSON.stringify(['Lone Star Mutual', 'Hill Country Casualty'])]);
  }
  await user('shop@demo.test', 'Ray Delgado', 'shop', { shop_id: shop.id });
  await user('estimator@demo.test', 'Pat Morgan', 'estimator', { credentials: 'Sample credentials: 12 years estimating', pay: 2200 });
  for (const kind of ['rear', 'front'] as const) {
    const { id } = await createJob({ shopId: shop.id, source: 'upload', notes: kind === 'rear' ? 'Found a kinked reinforcement behind the cover at teardown.' : '',
      estimate: { filename: `sample-${kind}.pdf`, data: await sampleEstimate(kind) },
      photos: [{ filename: 'teardown-1.jpg', data: await photo(`${kind} damage after teardown`, '#475569'), label: 'Damage after teardown' },
        { filename: 'teardown-2.jpg', data: await photo('sensor bracket', '#7c2d12'), label: 'Sensor bracket' }] });
    await processJob(id);
  }
  console.log(`Demo data ready.\n  Shop user:  shop@demo.test / ${PASSWORD}\n  Estimator:  estimator@demo.test / ${PASSWORD}\n  (Sample data only: the estimates, people and shop are made up.)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
