// Estimate PDF parsing: text extraction with positions, header metadata, and a
// column-aware line parser for CCC ONE and Mitchell style estimate printouts.
export interface TextItem { str: string; x: number; w: number; }
export interface TextLine { text: string; items: TextItem[]; }
export interface EstimateLine {
  line_no: number | null; section: string; operation: string; description: string;
  part_number: string; qty: number | null; price_cents: number | null;
  labor_hours: number | null; paint_hours: number | null; raw: string;
}
export interface EstimateMeta { vin: string; claim_number: string; insurer: string; ro_number: string; vehicle: string; total_cents: number | null; }
export interface ParsedEstimate { text: string; lines: EstimateLine[]; meta: EstimateMeta; pages: number; }

export async function extractPdfLines(data: Buffer): Promise<{ lines: TextLine[]; pages: number }> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const out: TextLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, TextItem[]>();
    const ys: number[] = [];
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5];
      const found = ys.find((v) => Math.abs(v - y) <= 2.5);
      const key: number = found ?? y;
      if (found === undefined) { ys.push(y); rows.set(y, []); }
      rows.get(key)!.push({ str: it.str.trim(), x: it.transform[4], w: it.width || it.str.length * 4.5 });
    }
    for (const y of ys.sort((a, b) => b - a)) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      out.push({ text: items.map((i) => i.str).join(' ').replace(/\s+/g, ' '), items });
    }
  }
  return { lines: out, pages: pdf.numPages };
}

const OPS: [RegExp, string][] = [
  [/^(repl|replace|remove\/replace|r&r)$/i, 'repl'], [/^(rpr|repair)$/i, 'rpr'],
  [/^(r&i|remove\/install|r\+i)$/i, 'r&i'], [/^(o\/h|overhaul)$/i, 'o/h'],
  [/^(refn|rfn|refinish|refinish\/repair)$/i, 'refn'], [/^(blnd|blend)$/i, 'blnd'],
  [/^(subl|sublet)$/i, 'subl'], [/^(algn|align)$/i, 'algn'], [/^(sect|section)$/i, 'sect'],
  [/^(add|add'l|addl)$/i, 'add'],
];
export const normOp = (t: string) => { for (const [re, op] of OPS) if (re.test(t)) return op; return ''; };
const isNum = (t: string) => /^-?\$?[\d,]*\.?\d+m?$/i.test(t) || /^incl\.?$/i.test(t);
const toNum = (t: string) => { const n = parseFloat(t.replace(/[$,m]/gi, '')); return Number.isFinite(n) ? n : null; };

type Col = 'line' | 'oper' | 'description' | 'part' | 'qty' | 'price' | 'labor' | 'paint';
function headerCols(l: TextLine): Partial<Record<Col, number>> | null {
  if (!/description/i.test(l.text) || !/(labor|paint|refinish)/i.test(l.text)) return null;
  const cols: Partial<Record<Col, number>> = {};
  for (const w of words(l)) {
    const s = w.str.toLowerCase();
    const c: Col | null = /^line/.test(s) ? 'line' : /^oper/.test(s) ? 'oper' : /^desc/.test(s) ? 'description' : /^part/.test(s) ? 'part'
      : /^(qty|quantity)/.test(s) ? 'qty' : /^(price|amount|dollar)/.test(s) ? 'price' : /^labor/.test(s) ? 'labor' : /^(paint|refinish)/.test(s) ? 'paint' : null;
    if (c && cols[c] === undefined) cols[c] = w.x + w.w / 2;
  }
  return cols.description !== undefined ? cols : null;
}
// Split text items into words with estimated x positions.
function words(l: TextLine): TextItem[] {
  const out: TextItem[] = [];
  for (const it of l.items) {
    const per = it.w / Math.max(it.str.length, 1);
    let idx = 0;
    for (const part of it.str.split(/\s+/)) {
      const at = it.str.indexOf(part, idx);
      out.push({ str: part, x: it.x + at * per, w: part.length * per });
      idx = at + part.length;
    }
  }
  return out;
}

export function parseLines(lines: TextLine[]): EstimateLine[] {
  const out: EstimateLine[] = [];
  let cols: Partial<Record<Col, number>> | null = null;
  let section = '';
  for (const l of lines) {
    const h = headerCols(l);
    if (h) { cols = h; continue; }
    const ws = words(l);
    if (ws.length < 2 || !/^\d{1,3}$/.test(ws[0].str)) continue;
    const lineNo = parseInt(ws[0].str, 10);
    let rest = ws.slice(1).filter((w) => !/^[*#]+$/.test(w.str) && !/^S\d{2}$/.test(w.str));
    if (!rest.length) continue;
    const e: EstimateLine = { line_no: lineNo, section, operation: '', description: '', part_number: '', qty: null, price_cents: null, labor_hours: null, paint_hours: null, raw: l.text };
    // Mitchell rows carry an entry number and labor type before the operation.
    while (rest.length > 2 && (/^\d{5,7}$/.test(rest[0].str) || /^(BDY|REF|MCH|FRM|GLS|ELE|TRM)$/i.test(rest[0].str))) rest = rest.slice(1);
    const op = normOp(rest[0].str);
    if (op) { e.operation = op; rest = rest.slice(1); }
    const text: TextItem[] = []; const nums: TextItem[] = [];
    // Trailing numeric tokens are the price / labor / paint columns.
    let i = rest.length;
    while (i > 0 && isNum(rest[i - 1].str)) i--;
    text.push(...rest.slice(0, i)); nums.push(...rest.slice(i));
    if (cols && (cols.labor !== undefined || cols.paint !== undefined)) {
      const numericCols = (['qty', 'price', 'labor', 'paint'] as Col[]).filter((c) => cols![c] !== undefined);
      for (const n of nums) {
        const cx = n.x + n.w / 2;
        const c = numericCols.reduce((best, k) => (Math.abs(cols![k]! - cx) < Math.abs(cols![best]! - cx) ? k : best));
        assign(e, c, n.str);
      }
      if (cols.part !== undefined && cols.description !== undefined) {
        const boundary = (cols.description + cols.part) / 2 + 10;
        const partW = text.filter((t) => t.x + t.w / 2 > boundary && /\d/.test(t.str));
        if (partW.length) { e.part_number = partW.map((t) => t.str).join(' '); for (const pw of partW) text.splice(text.indexOf(pw), 1); }
      }
    } else {
      // No header seen: money has cents and is usually large; hours have one decimal.
      const hrs: string[] = [];
      for (const n of nums) {
        if (/^incl/i.test(n.str)) { hrs.push(n.str); continue; }
        const v = toNum(n.str);
        if (v === null) continue;
        if (/\.\d{2}$/.test(n.str.replace(/m$/i, '')) && (v >= 20 || n.str.includes(','))) e.price_cents = Math.round(v * 100);
        else if (/^\d+$/.test(n.str) && e.qty === null && v <= 20) e.qty = v;
        else hrs.push(n.str);
      }
      if (hrs[0]) assign(e, e.operation === 'refn' || e.operation === 'blnd' ? 'paint' : 'labor', hrs[0]);
      if (hrs[1]) assign(e, 'paint', hrs[1]);
    }
    e.description = text.map((t) => t.str).join(' ').trim();
    if (!e.description && !e.operation) continue;
    const hasNums = e.price_cents !== null || e.labor_hours !== null || e.paint_hours !== null;
    if (!e.operation && !hasNums && e.description === e.description.toUpperCase() && /[A-Z]{3}/.test(e.description)) {
      section = e.description; e.section = section;
    }
    out.push(e);
  }
  return out;
}
function assign(e: EstimateLine, c: Col, s: string) {
  const v = /^incl/i.test(s) ? 0 : toNum(s);
  if (v === null) return;
  if (c === 'price') e.price_cents = Math.round(v * 100);
  else if (c === 'qty') e.qty = v;
  else if (c === 'labor') e.labor_hours = v;
  else if (c === 'paint') e.paint_hours = v;
}

export function validVin(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  const map: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const wts = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) { const ch = vin[i]; sum += (/\d/.test(ch) ? +ch : map[ch]) * wts[i]; }
  const check = sum % 11 === 10 ? 'X' : String(sum % 11);
  return vin[8] === check;
}

export function parseMeta(text: string): EstimateMeta {
  const m: EstimateMeta = { vin: '', claim_number: '', insurer: '', ro_number: '', vehicle: '', total_cents: null };
  const up = text.toUpperCase();
  const labeled = up.match(/VIN\s*(?:#|NO\.?|NUMBER)?\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/);
  const any = [...up.matchAll(/\b([A-HJ-NPR-Z0-9]{17})\b/g)].map((x) => x[1]).filter((v) => /\d/.test(v) && /[A-Z]/.test(v));
  m.vin = labeled?.[1] ?? any.find(validVin) ?? any[0] ?? '';
  m.claim_number = text.match(/claim\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,24})/i)?.[1] ?? '';
  if (/^(number|no)$/i.test(m.claim_number)) m.claim_number = '';
  m.insurer = (text.match(/(?:insurance\s+company|insurer|carrier)\s*:?\s+([^\n]{2,60})/i)?.[1] ?? '').split(/\s{2,}|\s+(?:claim|policy|adjuster|phone)\b/i)[0].trim();
  m.ro_number = text.match(/\b(?:RO|repair\s+order)\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{1,15})/i)?.[1] ?? '';
  const veh = text.split('\n').map((l) => l.trim()).find((l) => /^(?:vehicle\s*:?\s*)?(?:19|20)\d{2}\s+[A-Za-z]/.test(l) && l.length < 90);
  m.vehicle = veh ? veh.replace(/^vehicle\s*:?\s*/i, '').replace(/\s+VIN.*$/i, '').trim() : '';
  const tot = text.match(/(grand\s+total|total\s+cost\s+of\s+repairs|net\s+cost\s+of\s+repairs|gross\s+total)[^\d\n]{0,40}\$?\s*([\d,]+\.\d{2})/i);
  m.total_cents = tot ? Math.round(parseFloat(tot[2].replace(/,/g, '')) * 100) : null;
  return m;
}

export async function parseEstimatePdf(data: Buffer): Promise<ParsedEstimate> {
  const { lines, pages } = await extractPdfLines(data);
  const text = lines.map((l) => l.text).join('\n');
  return { text, lines: parseLines(lines), meta: parseMeta(text), pages };
}
