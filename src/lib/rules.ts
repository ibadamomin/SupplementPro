import { q } from './db';
import { rateFor, type Rates } from './format';
import type { EstimateLine } from './parser';

export interface Rule {
  rule_id: string; code: string; version: number; version_id: number; title: string; category: string; description: string;
  triggers: string[]; satisfied_by: string[]; labor_hours: number; labor_type: string; flat_amount_cents: number; source: string;
  archived: boolean; created_at: Date; change_note: string;
}
const LATEST = `
  SELECT r.id AS rule_id, r.code, r.archived, v.id AS version_id, v.version, v.title, v.category, v.description,
         v.triggers, v.satisfied_by, v.labor_hours, v.labor_type, v.flat_amount_cents, v.source, v.created_at, v.change_note
  FROM rules r JOIN rule_versions v ON v.rule_id = r.id
  WHERE v.version = (SELECT max(version) FROM rule_versions WHERE rule_id = r.id)`;
export const allRules = () => q<Rule>(`${LATEST} ORDER BY v.category, r.code`);
export const activeRules = () => q<Rule>(`${LATEST} AND NOT r.archived ORDER BY v.category, r.code`);
export const getRule = async (id: string) => (await q<Rule>(`${LATEST} AND r.id = $1`, [id]))[0];
export const libraryVersion = async () => (await q<{ v: number }>('SELECT coalesce(max(id),0)::int AS v FROM rule_versions'))[0].v;

const OP_WORDS: Record<string, string> = {
  repl: 'repl|replace|remove/replace', rpr: 'rpr|repair', 'r&i': 'r&i|remove/install', 'o/h': 'o/h|overhaul',
  refn: 'refn|rfn|refinish', blnd: 'blnd|blend', subl: 'subl|sublet', algn: 'algn|align', sect: 'sect|section',
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match (plural allowed); a trailing * makes it a prefix match.
export function phraseRe(token: string): RegExp {
  const prefix = token.endsWith('*');
  const body = esc((prefix ? token.slice(0, -1) : token).toLowerCase()).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${body}${prefix ? '' : '(?:s|es)?(?![a-z0-9])'}`, 'i');
}
export function tokenMatches(token: string, lines: EstimateLine[], rawText: string): boolean {
  token = token.trim().toLowerCase();
  if (!token) return false;
  if (token === '*') return true;
  if (token.startsWith('op:')) {
    const [op, ...rest] = token.slice(3).split(/\s+/);
    const phrase = rest.join(' ');
    if (lines.length >= 3) return lines.some((l) => l.operation === op && (!phrase || phraseRe(phrase).test(l.description)));
    const opRe = new RegExp(`(^|[^a-z0-9&/])(${(OP_WORDS[op] ?? esc(op)).split('|').map(esc).join('|')})(?![a-z0-9])`, 'i');
    return rawText.split('\n').some((ln) => opRe.test(ln) && (!phrase || phraseRe(phrase).test(ln)));
  }
  return phraseRe(token).test(rawText);
}

export interface Candidate { rule: Rule; matched: string; amount_cents: number; }
export function amountFor(r: { labor_hours: number; labor_type: string; flat_amount_cents: number }, rates: Rates | null) {
  return Math.round(r.labor_hours * rateFor(rates, r.labor_type) * 100) + (r.flat_amount_cents || 0);
}
// Deterministic checklist pass: a rule is a candidate when a trigger appears on the
// estimate and nothing in satisfied_by does.
export function matchRules(rules: Rule[], lines: EstimateLine[], rawText: string, rates: Rates | null): Candidate[] {
  const out: Candidate[] = [];
  if (!rawText.trim() && !lines.length) return out;
  const text = rawText || lines.map((l) => `${l.operation} ${l.description}`).join('\n');
  for (const rule of rules) {
    const trig = rule.triggers.find((t) => tokenMatches(t, lines, text));
    if (!trig) continue;
    if (rule.satisfied_by.some((t) => tokenMatches(t, lines, text))) continue;
    out.push({ rule, matched: trig, amount_cents: amountFor(rule, rates) });
  }
  return out;
}
