import { rateFor, usd, LABOR_TYPES, CATEGORIES, type Rates } from './format';
import type { EstimateLine } from './parser';
import { amountFor, type Candidate, type Rule } from './rules';

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

export interface DraftItem {
  rule_id: string | null; title: string; category: string; reason: string; source: string;
  labor_hours: number; labor_type: string; amount_cents: number;
}
export interface DraftResult { items: DraftItem[]; letter: string; mode: 'claude' | 'rules'; model?: string; note?: string; }
export interface DraftContext {
  shop: { name: string; rates: Rates };
  job: { insurer: string; vehicle: string; vin: string; notes: string };
  lines: EstimateLine[]; rawText: string; estimatePdf?: Buffer;
  photos: { label: string; jpeg: Buffer }[];
  rules: Rule[]; candidates: Candidate[];
  playbook: { topic: string; denial_pattern: string; response: string }[];
}

async function client() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 180_000 });
}
function toolInput(msg: any, name: string): any {
  const block = msg.content.find((b: any) => b.type === 'tool_use' && b.name === name);
  if (!block) throw new Error('Model returned no structured result');
  return block.input;
}

export const defaultIntro = (shopName: string, vehicle: string) =>
  `During teardown and repair planning for the ${vehicle || 'vehicle'} referenced above, ${shopName} identified the operations listed below. ` +
  `They are required to complete a safe and proper repair according to the vehicle manufacturer's procedures, and they are not on the current estimate. ` +
  `We request that the estimate be supplemented to include them. Supporting documentation is attached.`;

function fromCandidates(c: Candidate[]): DraftItem[] {
  return c.map(({ rule, amount_cents }) => ({
    rule_id: rule.rule_id, title: rule.title, category: rule.category, reason: rule.description, source: rule.source,
    labor_hours: rule.labor_hours, labor_type: rule.labor_type, amount_cents,
  }));
}

const SYSTEM = `You assist a collision repair shop's estimator. You compare an insurer's repair estimate against the vehicle, teardown photos and the shop's rules library, and list operations that are required for a proper repair but missing from the estimate (a "supplement").

Rules you must follow:
- Flag an operation only when the estimate, photos or shop notes support it. Do not flag anything already on the estimate.
- Prefer items from the rules library and give their rule_code. You may add an item outside the library only when a photo or estimate line clearly shows the need; give it rule_code null.
- Never invent citations, document numbers, part numbers or OEM quotes. For "source", reuse the rule's source text, or write "Estimator to verify source".
- Hours and amounts are starting points for a human estimator who reviews everything. Be conservative.
- "reason" is one or two plain sentences specific to this vehicle and estimate (mention the line or photo that triggers it).
- The cover note is written in the shop's voice to the insurer, factual and polite, three to five sentences, no itemized list (the list is added separately).`;

export async function draftSupplement(ctx: DraftContext): Promise<DraftResult> {
  const fallback = (note?: string): DraftResult => ({
    items: fromCandidates(ctx.candidates), letter: defaultIntro(ctx.shop.name, ctx.job.vehicle), mode: 'rules', note,
  });
  if (!aiEnabled()) return fallback();
  try {
    const content: any[] = [];
    if (ctx.estimatePdf && ctx.estimatePdf.length < 20_000_000) {
      content.push({ type: 'document', title: 'Insurer estimate', source: { type: 'base64', media_type: 'application/pdf', data: ctx.estimatePdf.toString('base64') } });
    }
    ctx.photos.slice(0, 8).forEach((p, i) => {
      content.push({ type: 'text', text: `Photo ${i + 1}${p.label ? ': ' + p.label : ''}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.jpeg.toString('base64') } });
    });
    const rates = Object.fromEntries(LABOR_TYPES.map((t) => [t, rateFor(ctx.shop.rates, t)]));
    content.push({ type: 'text', text: [
      `Shop: ${ctx.shop.name}. Labor rates ($/hr): ${JSON.stringify(rates)}.`,
      `Insurer: ${ctx.job.insurer || 'unknown'}. Vehicle: ${ctx.job.vehicle || 'unknown'}. VIN: ${ctx.job.vin || 'unknown'}.`,
      ctx.job.notes ? `Shop notes: ${ctx.job.notes}` : '',
      `Parsed estimate lines (may be incomplete; the PDF is authoritative):\n${ctx.lines.length ? ctx.lines.map((l) => `${l.line_no ?? ''} | ${l.operation} | ${l.description} | labor ${l.labor_hours ?? ''} | paint ${l.paint_hours ?? ''} | $${l.price_cents != null ? l.price_cents / 100 : ''}`).join('\n') : ctx.rawText.slice(0, 20000) || '(none)'}`,
      `Rules library:\n${ctx.rules.map((r) => `${r.code} | ${r.title} | ${r.category} | ${r.description} | default ${r.labor_hours} hr ${r.labor_type} + $${r.flat_amount_cents / 100} | source: ${r.source}`).join('\n')}`,
      `Checklist pass already matched these rule codes as likely missing: ${ctx.candidates.map((c) => c.rule.code).join(', ') || 'none'}. Confirm or drop each one, and add others that apply.`,
      ctx.playbook.length ? `Known denial patterns for this insurer (write reasons that pre-empt them):\n${ctx.playbook.map((p) => `${p.topic}: ${p.denial_pattern}`).join('\n')}` : '',
      'Call submit_supplement_draft with your result.',
    ].filter(Boolean).join('\n\n') });

    const msg = await (await client()).messages.create({
      model: MODEL(), max_tokens: 8000, system: SYSTEM,
      tools: [{
        name: 'submit_supplement_draft', description: 'Submit the drafted supplement items and cover note.',
        input_schema: { type: 'object', required: ['items', 'cover_note'], properties: {
          cover_note: { type: 'string' },
          items: { type: 'array', items: { type: 'object', required: ['title', 'reason', 'category', 'labor_hours', 'labor_type'], properties: {
            rule_code: { type: ['string', 'null'] }, title: { type: 'string' }, category: { type: 'string', enum: [...CATEGORIES] },
            reason: { type: 'string' }, source: { type: 'string' }, labor_hours: { type: 'number' },
            labor_type: { type: 'string', enum: [...LABOR_TYPES] }, flat_amount_usd: { type: 'number', description: 'Sublet or material dollars on top of labor, 0 if none' },
          } } },
        } },
      }],
      tool_choice: { type: 'tool', name: 'submit_supplement_draft' },
      messages: [{ role: 'user', content }],
    } as any);
    const out = toolInput(msg, 'submit_supplement_draft');
    const byCode = new Map(ctx.rules.map((r) => [r.code, r]));
    const items: DraftItem[] = (Array.isArray(out.items) ? out.items : []).slice(0, 40).map((it: any) => {
      const rule = it.rule_code ? byCode.get(String(it.rule_code)) : undefined;
      const labor_type = (LABOR_TYPES as readonly string[]).includes(it.labor_type) ? it.labor_type : rule?.labor_type ?? 'body';
      const labor_hours = Math.max(0, Math.min(40, Number(it.labor_hours) || 0));
      const flat = it.flat_amount_usd != null ? Math.round(Math.max(0, Number(it.flat_amount_usd) || 0) * 100) : rule?.flat_amount_cents ?? 0;
      return {
        rule_id: rule?.rule_id ?? null, title: String(it.title || rule?.title || 'Untitled').slice(0, 200),
        category: (CATEGORIES as readonly string[]).includes(it.category) ? it.category : rule?.category ?? 'other',
        reason: String(it.reason || rule?.description || ''), source: String(rule?.source || it.source || 'Estimator to verify source'),
        labor_hours, labor_type, amount_cents: amountFor({ labor_hours, labor_type, flat_amount_cents: flat }, ctx.shop.rates),
      };
    });
    return { items, letter: String(out.cover_note || defaultIntro(ctx.shop.name, ctx.job.vehicle)), mode: 'claude', model: MODEL() };
  } catch (e: any) {
    console.error('[ai] draft failed, using rules-only draft:', e?.message);
    return fallback(`AI draft failed (${String(e?.message || e).slice(0, 200)}). Showing the rules-only draft.`);
  }
}

// Used when the positional parser finds too few lines (unusual layouts, scanned PDFs).
export async function extractLinesWithAI(pdf: Buffer): Promise<EstimateLine[] | null> {
  if (!aiEnabled() || pdf.length > 20_000_000) return null;
  try {
    const msg = await (await client()).messages.create({
      model: MODEL(), max_tokens: 16000,
      tools: [{ name: 'record_estimate_lines', description: 'Record every line item of the repair estimate.',
        input_schema: { type: 'object', required: ['lines'], properties: { lines: { type: 'array', items: { type: 'object', required: ['description'], properties: {
          line_no: { type: ['integer', 'null'] }, section: { type: 'string' },
          operation: { type: 'string', enum: ['repl', 'rpr', 'r&i', 'o/h', 'refn', 'blnd', 'subl', 'algn', 'sect', 'add', ''] },
          description: { type: 'string' }, part_number: { type: 'string' }, qty: { type: ['number', 'null'] },
          price_usd: { type: ['number', 'null'] }, labor_hours: { type: ['number', 'null'] }, paint_hours: { type: ['number', 'null'] },
        } } } } } }],
      tool_choice: { type: 'tool', name: 'record_estimate_lines' },
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
        { type: 'text', text: 'Extract every line item of this collision repair estimate exactly as printed. Do not add or infer lines.' },
      ] }],
    } as any);
    const out = toolInput(msg, 'record_estimate_lines');
    return (out.lines as any[]).slice(0, 500).map((l) => ({
      line_no: Number.isInteger(l.line_no) ? l.line_no : null, section: String(l.section || ''), operation: String(l.operation || ''),
      description: String(l.description || ''), part_number: String(l.part_number || ''), qty: l.qty ?? null,
      price_cents: l.price_usd != null ? Math.round(Number(l.price_usd) * 100) : null,
      labor_hours: l.labor_hours ?? null, paint_hours: l.paint_hours ?? null, raw: '',
    }));
  } catch (e: any) { console.error('[ai] line extraction failed:', e?.message); return null; }
}

export interface RebuttalContext {
  shopName: string; insurer: string; vehicle: string; claim: string;
  item: { title: string; reason: string; source: string; amount_cents: number; category: string };
  denialReason: string; playbook: { topic: string; denial_pattern: string; response: string }[];
}
export async function draftRebuttal(c: RebuttalContext): Promise<string> {
  const words = (c.item.title + ' ' + c.item.category).toLowerCase();
  const play = c.playbook.find((p) => p.topic.toLowerCase().split(/\W+/).some((w) => w.length > 3 && words.includes(w.replace(/s$/, ''))));
  const template =
    `Re: Claim ${c.claim || '(claim number)'} — ${c.vehicle || 'vehicle'}\n\n` +
    `We are writing about the denial of "${c.item.title}" (${usd(c.item.amount_cents)}) on our supplement request.` +
    (c.denialReason ? ` The reason given was: "${c.denialReason}".` : '') + `\n\n` +
    `${c.item.reason}\n\n` +
    (play ? `${play.response}\n\n` : '') +
    `Reference: ${c.item.source || 'see attached documentation'}.\n\n` +
    `This operation was necessary to return the vehicle to its pre-loss condition in line with the manufacturer's repair procedures. ` +
    `We ask that you reconsider and approve it. If the denial stands, please send the specific policy or procedure basis in writing.\n\n` +
    `Thank you,\n${c.shopName}`;
  if (!aiEnabled()) return template;
  try {
    const msg = await (await client()).messages.create({
      model: MODEL(), max_tokens: 1200,
      system: `You draft short, factual rebuttal letters from a collision repair shop to an insurer about a denied supplement line. Write in the shop's voice. Never invent citations, document numbers or quotes; refer only to the source text given. No threats or legal claims. Under 220 words. Plain text only.`,
      messages: [{ role: 'user', content: `Shop: ${c.shopName}\nInsurer: ${c.insurer}\nVehicle: ${c.vehicle}\nClaim: ${c.claim}\nDenied operation: ${c.item.title} (${usd(c.item.amount_cents)})\nWhy it is needed: ${c.item.reason}\nSource to reference: ${c.item.source}\nInsurer's denial reason: ${c.denialReason || 'not given'}\n${play ? `Recommended argument from our playbook: ${play.response}` : ''}\n\nWrite the rebuttal.` }],
    });
    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return text || template;
  } catch (e: any) { console.error('[ai] rebuttal failed:', e?.message); return template; }
}
