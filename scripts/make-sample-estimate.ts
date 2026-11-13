// Generates sample estimate PDFs laid out like common estimating-system printouts.
// They are made-up data for demos and tests, not real estimates.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type Row = [string, string, string, string, string, string, string, string]; // line, oper, desc, part, qty, price, labor, paint
const X = { line: 40, oper: 70, desc: 112, part: 300, qty: 400, price: 470, labor: 520, paint: 562 };

export async function sampleEstimate(kind: 'rear' | 'front' = 'rear'): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica), b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  let y = 750;
  const t = (s: string, x: number, o: { bold?: boolean; size?: number; right?: boolean } = {}) => {
    const font = o.bold ? b : f, size = o.size ?? 9;
    page.drawText(s, { x: o.right ? x - font.widthOfTextAtSize(s, size) : x, y, size, font, color: rgb(0, 0, 0) });
  };
  const rear = kind === 'rear';
  t(rear ? 'LONE STAR MUTUAL INSURANCE' : 'HILL COUNTRY CASUALTY', 40, { bold: true, size: 13 }); y -= 16;
  t('Estimate of Record', 40, { size: 10 }); y -= 22;
  t(`Insurance Company: ${rear ? 'Lone Star Mutual' : 'Hill Country Casualty'}`, 40); t(`Claim #: ${rear ? 'LSM-4471902' : 'HCC-883120'}`, 330); y -= 13;
  t(`Owner: SAMPLE CUSTOMER`, 40); t(`RO Number: ${rear ? '10442' : '10457'}`, 330); y -= 13;
  t(`Adjuster: ${rear ? 'Dana Whitfield' : 'Marcus Lee'}`, 40); t('Date of Loss: 10/28/2026', 330); y -= 20;
  t(rear ? '2021 TOYOTA RAV4 XLE AWD 4D UTV 2.5L Gray' : '2020 HONDA ACCORD EX-L 4D SED 1.5L White', 40, { bold: true }); y -= 13;
  t(`VIN: ${rear ? '2T3P1RFV8MC140211' : '1HGCV1F56LA021455'}`, 40); t('Odometer: 41,260', 330); y -= 22;
  t('Line', X.line, { bold: true }); t('Oper', X.oper, { bold: true }); t('Description', X.desc, { bold: true }); t('Part Number', X.part, { bold: true });
  t('Qty', X.qty, { bold: true }); t('Price', X.price, { bold: true, right: true }); t('Labor', X.labor, { bold: true, right: true }); t('Paint', X.paint, { bold: true, right: true }); y -= 5;
  page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5 }); y -= 12;
  const rows: Row[] = rear ? [
    ['1', '', 'REAR BUMPER', '', '', '', '', ''],
    ['2', 'O/H', 'rear bumper', '', '', '', '2.2', ''],
    ['3', 'Repl', 'Bumper cover', '521590R912', '1', '412.33', 'Incl.', '3.0'],
    ['4', 'Repl', 'RT Reflector', '8148042010', '1', '38.12', '0.2', ''],
    ['5', 'Repl', 'Absorber', '5261542050', '1', '96.40', 'Incl.', ''],
    ['6', '', 'REAR LAMPS', '', '', '', '', ''],
    ['7', 'R&I', 'RT Tail lamp assy', '', '', '', '0.4', ''],
    ['8', '', 'QUARTER PANEL', '', '', '', '', ''],
    ['9', 'Rpr', 'RT Quarter panel', '', '', '', '4.5', '2.6'],
    ['10', 'R&I', 'RT Qtr glass', '', '', '', '1.2', ''],
    ['11', 'Refn', 'RT Quarter outside', '', '', '', '', '2.6'],
    ['12', '', 'LIFT GATE', '', '', '', '', ''],
    ['13', 'R&I', 'Lift gate trim panel', '', '', '', '0.5', ''],
    ['14', '', 'MISCELLANEOUS OPERATIONS', '', '', '', '', ''],
    ['15', 'Add', 'Clear coat', '', '', '', '', '1.1'],
  ] : [
    ['1', '', 'FRONT BUMPER & GRILLE', '', '', '', '', ''],
    ['2', 'O/H', 'front bumper', '', '', '', '2.4', ''],
    ['3', 'Repl', 'Bumper cover', '04711TVAA90ZZ', '1', '388.74', 'Incl.', '3.0'],
    ['4', 'Repl', 'A/M Grille assy', 'HO1200244', '1', '142.00', '0.3', ''],
    ['5', '', 'FRONT LAMPS', '', '', '', '', ''],
    ['6', 'Repl', 'LT Headlamp assy', '33150TVAA11', '1', '612.05', 'Incl.', ''],
    ['7', '', 'RADIATOR SUPPORT', '', '', '', '', ''],
    ['8', 'Repl', 'A/C Condenser', '80110TVAA02', '1', '254.90', '1.8', ''],
    ['9', 'Subl', 'Evacuate & recharge A/C', '', '1', '145.00', '', ''],
    ['10', '', 'HOOD', '', '', '', '', ''],
    ['11', 'Rpr', 'Hood panel', '', '', '', '2.0', '3.2'],
    ['12', 'Blnd', 'LT Fender', '', '', '', '', '1.1'],
    ['13', '', 'MISCELLANEOUS OPERATIONS', '', '', '', '', ''],
    ['14', 'Subl', 'Pre-repair scan', '', '1', '50.00', '', ''],
    ['15', 'Add', 'Cover car for overspray', '', '', '5.00', '0.2', ''],
  ];
  for (const r of rows) {
    const sect = !r[1] && !r[5] && !r[6] && !r[7];
    t(r[0], X.line); t(r[1], X.oper); t(r[2], X.desc, { bold: sect }); t(r[3], X.part); t(r[4], X.qty);
    if (r[5]) t(r[5], X.price, { right: true }); if (r[6]) t(r[6], X.labor, { right: true }); if (r[7]) t(r[7], X.paint, { right: true });
    y -= 13;
  }
  y -= 10; page.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.5 }); y -= 16;
  t('ESTIMATE TOTALS', 40, { bold: true }); y -= 13;
  t('Parts', 60); t(rear ? '546.85' : '1,397.69', 300, { right: true }); y -= 12;
  t('Body Labor', 60); t(rear ? '9.0 hrs @ $58.00/hr' : '6.7 hrs @ $58.00/hr', 150); y -= 12;
  t('Paint Labor', 60); t(rear ? '9.3 hrs @ $58.00/hr' : '7.3 hrs @ $58.00/hr', 150); y -= 12;
  t('Paint Supplies', 60); t(rear ? '9.3 hrs @ $38.00/hr' : '7.3 hrs @ $38.00/hr', 150); y -= 16;
  t('Grand Total', 60, { bold: true }); t(rear ? '$ 2,084.35' : '$ 2,832.99', 300, { bold: true, right: true });
  return Buffer.from(await pdf.save());
}

if (process.argv[1]?.includes('make-sample-estimate')) {
  (async () => {
    const dir = path.resolve('samples'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sample-estimate-rear-hit.pdf'), await sampleEstimate('rear'));
    fs.writeFileSync(path.join(dir, 'sample-estimate-front-hit.pdf'), await sampleEstimate('front'));
    console.log('Wrote 2 sample estimates to', dir);
  })();
}
