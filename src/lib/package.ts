import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { q } from './db';
import { usd, fmtDate } from './format';
import { getDocs, getItems, getJobRaw, getShop } from './jobs';
import { readDocument, type Doc } from './storage';

const W = 612, H = 792, M = 54;
// Standard PDF fonts cover WinAnsi only; normalise anything else.
const clean = (s: string) => (s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/•/g, '-').replace(/…/g, '...').replace(/\t/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) > maxW && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildPackage(jobId: string): Promise<{ pdf: Buffer; total_cents: number; filename: string }> {
  const job = (await getJobRaw(jobId))!;
  const shop = (await getShop(job.shop_id))!;
  const items = (await getItems(jobId)).filter((i) => i.status === 'approved');
  const docs = await getDocs(jobId);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.1, 0.12, 0.16), gray = rgb(0.42, 0.45, 0.5), rule = rgb(0.82, 0.84, 0.87);
  const pages: PDFPage[] = [];
  let page!: PDFPage, y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const text = (s: string, o: { f?: PDFFont; size?: number; color?: any; x?: number; maxW?: number; gap?: number } = {}) => {
    const f = o.f ?? font, size = o.size ?? 10, x = o.x ?? M;
    for (const ln of wrap(s, f, size, o.maxW ?? W - x - M)) { need(size + 4); page.drawText(ln, { x, y: y - size, size, font: f, color: o.color ?? ink }); y -= size + 4; }
    y -= o.gap ?? 0;
  };
  const hr = () => { page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: rule }); y -= 10; };

  // ---- Letter ----
  newPage();
  text(shop.name, { f: bold, size: 16 });
  text([shop.address, shop.phone].filter(Boolean).join('  |  ') || ' ', { size: 9, color: gray, gap: 6 });
  hr();
  text(fmtDate(new Date()), { gap: 8 });
  text(`To: ${job.insurer || 'Claims department'}`, {});
  if (job.adjuster) text(`Attn: ${job.adjuster}`);
  y -= 8;
  text('Supplement request', { f: bold, size: 13, gap: 4 });
  const re: [string, string][] = [['Claim number', job.claim_number], ['Vehicle', job.vehicle], ['VIN', job.vin], ['Repair order', job.ro_number]];
  for (const [k, v] of re) if (v) { need(14); page.drawText(clean(k + ':'), { x: M, y: y - 10, size: 10, font: bold, color: ink }); page.drawText(clean(v), { x: M + 90, y: y - 10, size: 10, font, color: ink }); y -= 14; }
  y -= 8;
  text(job.letter, { gap: 10 });

  const colHrs = W - M - 140, colAmt = W - M - 60;
  need(40);
  page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: rgb(0.95, 0.96, 0.97) });
  page.drawText('#', { x: M + 6, y: y - 13, size: 9, font: bold, color: ink });
  page.drawText('Operation and justification', { x: M + 26, y: y - 13, size: 9, font: bold, color: ink });
  page.drawText('Hours', { x: colHrs, y: y - 13, size: 9, font: bold, color: ink });
  page.drawText('Amount', { x: colAmt, y: y - 13, size: 9, font: bold, color: ink });
  y -= 26;
  let total = 0;
  items.forEach((it, i) => {
    const descW = colHrs - (M + 26) - 12;
    const reason = wrap(it.reason, font, 9, descW), src = it.source ? wrap('Reference: ' + it.source, ital, 8.5, descW) : [];
    need(15 + reason.length * 12 + src.length * 11 + 16);
    page.drawText(String(i + 1), { x: M + 6, y: y - 10, size: 10, font, color: ink });
    page.drawText(clean(it.title).slice(0, 90), { x: M + 26, y: y - 10, size: 10, font: bold, color: ink });
    if (it.labor_hours) page.drawText(`${it.labor_hours.toFixed(1)} ${({ mechanical: 'mech', refinish: 'refinish' } as Record<string, string>)[it.labor_type] ?? it.labor_type}`, { x: colHrs, y: y - 10, size: 9, font, color: ink });
    const amt = usd(it.amount_cents);
    page.drawText(amt, { x: W - M - 6 - font.widthOfTextAtSize(amt, 10), y: y - 10, size: 10, font, color: ink });
    y -= 15;
    for (const ln of reason) { need(12); page.drawText(ln, { x: M + 26, y: y - 9, size: 9, font, color: ink }); y -= 12; }
    for (const ln of src) { need(11); page.drawText(ln, { x: M + 26, y: y - 8.5, size: 8.5, font: ital, color: gray }); y -= 11; }
    y -= 6; need(4);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rule }); y -= 8;
    total += it.amount_cents;
  });
  need(60);
  const tot = usd(total);
  page.drawText('Total requested', { x: colHrs - 60, y: y - 11, size: 11, font: bold, color: ink });
  page.drawText(tot, { x: W - M - 6 - bold.widthOfTextAtSize(tot, 11), y: y - 11, size: 11, font: bold, color: ink });
  y -= 30;
  text('Please contact us with any questions about these operations. We are glad to walk through the vehicle or the documentation with you.', { gap: 14 });
  text('Sincerely,', { gap: 14 });
  if (shop.contact_name) text(shop.contact_name, { f: bold });
  text(shop.name);
  if (shop.phone) text(shop.phone);

  // ---- Photos, two per page ----
  const photos = docs.filter((d) => d.kind === 'photo');
  for (let i = 0; i < photos.length; i++) {
    if (i % 2 === 0) { newPage(); text('Photo documentation', { f: bold, size: 13, gap: 8 }); }
    try {
      const img = await pdf.embedJpg(await readDocument(photos[i]));
      const boxW = W - 2 * M, boxH = 285;
      const s = Math.min(boxW / img.width, boxH / img.height);
      page.drawImage(img, { x: M + (boxW - img.width * s) / 2, y: y - img.height * s, width: img.width * s, height: img.height * s });
      y -= img.height * s + 6;
      text(`Photo ${i + 1}${photos[i].label ? ': ' + photos[i].label : ''}`, { size: 9, color: gray, gap: 14 });
    } catch (e) { text(`Photo ${i + 1} could not be embedded (${photos[i].filename}).`, { size: 9, color: gray, gap: 14 }); }
  }
  pages.forEach((p, i) => {
    const s = clean(`${shop.name}  |  Claim ${job.claim_number || '-'}  |  Page ${i + 1} of ${pages.length}`);
    p.drawText(s, { x: M, y: 30, size: 8, font, color: gray });
  });

  // ---- Supporting documents attached to the rules behind the approved items ----
  const ruleIds = [...new Set(items.map((i) => i.rule_id).filter(Boolean))] as string[];
  if (ruleIds.length) {
    const refs = await q<Doc>(`SELECT * FROM documents WHERE rule_id IN (${ruleIds.map((_, i) => '$' + (i + 1)).join(',')}) ORDER BY created_at`, ruleIds);
    for (const d of refs) {
      try {
        const data = await readDocument(d);
        if (d.mime === 'application/pdf') {
          const src = await PDFDocument.load(data, { ignoreEncryption: true });
          (await pdf.copyPages(src, src.getPageIndices())).forEach((p) => pdf.addPage(p));
        } else if (d.mime === 'image/jpeg' || d.mime === 'image/png') {
          const img = d.mime === 'image/png' ? await pdf.embedPng(data) : await pdf.embedJpg(data);
          const p = pdf.addPage([W, H]); const s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height);
          p.drawImage(img, { x: M, y: H - M - img.height * s, width: img.width * s, height: img.height * s });
        }
      } catch (e: any) { console.warn(`[package] could not attach ${d.filename}: ${e?.message}`); }
    }
  }
  const safe = (job.ro_number || String(job.number)).replace(/[^A-Za-z0-9-]/g, '');
  return { pdf: Buffer.from(await pdf.save()), total_cents: total, filename: `Supplement-${safe}.pdf` };
}
