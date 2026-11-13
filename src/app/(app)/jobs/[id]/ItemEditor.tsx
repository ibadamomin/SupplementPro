'use client';
import { useState } from 'react';

// Hours, labor type and amount inputs. Changing hours or type recalculates the amount
// from the shop's labor rate, keeping any flat (sublet or material) portion.
export function ItemEditor({ hours, type, amountCents, rates, disabled }: { hours: number; type: string; amountCents: number; rates: Record<string, number>; disabled?: boolean }) {
  const flat = Math.max(0, amountCents / 100 - hours * (rates[type] ?? 0));
  const [h, setH] = useState(String(hours));
  const [t, setT] = useState(type);
  const [amt, setAmt] = useState((amountCents / 100).toFixed(2));
  const recalc = (nh: string, nt: string) => setAmt((flat + (parseFloat(nh) || 0) * (rates[nt] ?? 0)).toFixed(2));
  return (
    <>
      <label className="block"><span className="label">Hours</span>
        <input className="input" name="labor_hours" type="number" step="0.1" min="0" value={h} disabled={disabled} onChange={(e) => { setH(e.target.value); recalc(e.target.value, t); }} /></label>
      <label className="block"><span className="label">Labor type</span>
        <select className="input" name="labor_type" value={t} disabled={disabled} onChange={(e) => { setT(e.target.value); recalc(h, e.target.value); }}>
          {Object.keys(rates).map((k) => <option key={k} value={k}>{k} · ${rates[k]}</option>)}</select></label>
      <label className="block"><span className="label">Amount ($)</span>
        <input className="input" name="amount" type="number" step="0.01" min="0" value={amt} disabled={disabled} onChange={(e) => setAmt(e.target.value)} /></label>
    </>
  );
}
