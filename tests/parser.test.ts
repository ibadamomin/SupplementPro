import { describe, expect, it } from 'vitest';
import { parseEstimatePdf, parseMeta, validVin } from '../src/lib/parser';
import { matchRules, phraseRe, tokenMatches, type Rule } from '../src/lib/rules';
import { SEED_RULES } from '../src/lib/seed-rules';
import { decrypt, encrypt } from '../src/lib/storage';
import { sampleEstimate } from '../scripts/make-sample-estimate';

const rules: Rule[] = SEED_RULES.map((r, i) => ({ ...r, rule_id: 'r' + i, version: 1, version_id: i, archived: false, created_at: new Date(), change_note: '' }));
const codes = (c: { rule: Rule }[]) => c.map((x) => x.rule.code);

describe('estimate parser', () => {
  it('reads header details and lines from a column-layout estimate', async () => {
    const p = await parseEstimatePdf(await sampleEstimate('rear'));
    expect(p.meta.vin).toBe('2T3P1RFV8MC140211');
    expect(p.meta.claim_number).toBe('LSM-4471902');
    expect(p.meta.insurer).toBe('Lone Star Mutual');
    expect(p.meta.ro_number).toBe('10442');
    expect(p.meta.vehicle).toMatch(/^2021 TOYOTA RAV4/);
    expect(p.meta.total_cents).toBe(208435);
    expect(p.lines).toHaveLength(15);
    const cover = p.lines.find((l) => l.description === 'Bumper cover')!;
    expect(cover).toMatchObject({ line_no: 3, operation: 'repl', part_number: '521590R912', qty: 1, price_cents: 41233, labor_hours: 0, paint_hours: 3.0, section: 'REAR BUMPER' });
    const qtr = p.lines.find((l) => l.description === 'RT Quarter panel')!;
    expect(qtr).toMatchObject({ operation: 'rpr', labor_hours: 4.5, paint_hours: 2.6, price_cents: null });
    expect(p.lines.find((l) => l.line_no === 11)).toMatchObject({ operation: 'refn', labor_hours: null, paint_hours: 2.6 });
  });
  it('validates VIN check digits', () => {
    expect(validVin('1HGCM82633A004352')).toBe(true);
    expect(validVin('1HGCM82633A004353')).toBe(false);
  });
  it('finds metadata in loose text', () => {
    const m = parseMeta('Carrier: Acme Insurance   Policy 12\nClaim Number: AB-12345\nVIN 1HGCM82633A004352\nTotal Cost of Repairs $ 1,234.56');
    expect(m).toMatchObject({ insurer: 'Acme Insurance', claim_number: 'AB-12345', vin: '1HGCM82633A004352', total_cents: 123456 });
  });
});

describe('rules engine', () => {
  it('matches whole words, plurals and prefixes only', () => {
    expect(phraseRe('wash').test('windshield washer reservoir')).toBe(false);
    expect(phraseRe('wash').test('wash vehicle')).toBe(true);
    expect(phraseRe('emblem').test('r&i emblems')).toBe(true);
    expect(phraseRe('calibrat*').test('radar calibration')).toBe(true);
    expect(phraseRe('rail').test('trailer hitch')).toBe(false);
  });
  it('matches operations on parsed lines', async () => {
    const p = await parseEstimatePdf(await sampleEstimate('rear'));
    expect(tokenMatches('op:refn', p.lines, p.text)).toBe(true);
    expect(tokenMatches('op:blnd', p.lines, p.text)).toBe(false);
    expect(tokenMatches('op:repl bumper cover', p.lines, p.text)).toBe(true);
  });
  it('flags what is missing and skips what is already on the estimate', async () => {
    const rear = await parseEstimatePdf(await sampleEstimate('rear'));
    const r = codes(matchRules(rules, rear.lines, rear.text, { body: 58, refinish: 58 }));
    expect(r).toEqual(expect.arrayContaining(['PRE-SCAN', 'POST-SCAN', 'ADAS-REAR', 'BLEND', 'FEATHER-PRIME-BLOCK', 'CORROSION', 'FLEX-ADDITIVE', 'COVER-CAR']));
    for (const c of ['ADAS-CAMERA', 'ADAS-FRONT', 'SEAM-SEALER', 'WELD-PRIMER']) expect(r).not.toContain(c);
    expect(r).not.toContain('AC-SERVICE');
    const front = await parseEstimatePdf(await sampleEstimate('front'));
    const f = codes(matchRules(rules, front.lines, front.text, {}));
    expect(f).toEqual(expect.arrayContaining(['POST-SCAN', 'ADAS-FRONT', 'HEADLAMP-AIM', 'TEST-FIT']));
    for (const c of ['PRE-SCAN', 'BLEND', 'COVER-CAR', 'AC-SERVICE']) expect(f).not.toContain(c);
  });
  it('prices from the shop labor rate plus any flat amount', async () => {
    const rear = await parseEstimatePdf(await sampleEstimate('rear'));
    const c = matchRules(rules, rear.lines, rear.text, { mechanical: 120 });
    expect(c.find((x) => x.rule.code === 'POST-SCAN')!.amount_cents).toBe(12000);
    expect(c.find((x) => x.rule.code === 'ADAS-REAR')!.amount_cents).toBe(25000);
  });
  it('returns nothing for an unreadable estimate', () => { expect(matchRules(rules, [], '', {})).toEqual([]); });
});

describe('file encryption', () => {
  it('round-trips and rejects tampering', () => {
    process.env.FILE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const blob = encrypt(Buffer.from('estimate bytes'));
    expect(blob.includes(Buffer.from('estimate bytes'))).toBe(false);
    expect(decrypt(blob).toString()).toBe('estimate bytes');
    blob[blob.length - 1] ^= 1;
    expect(() => decrypt(blob)).toThrow();
  });
});
