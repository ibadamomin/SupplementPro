// VIN decoding through the free NHTSA vPIC service. Fails soft: the job continues without it.
export interface Vehicle { year?: string; make?: string; model?: string; trim?: string; body?: string; }
export async function decodeVin(vin: string): Promise<Vehicle | null> {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return null;
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = (await r.json())?.Results?.[0];
    if (!d || !d.Make) return null;
    return { year: d.ModelYear || undefined, make: d.Make || undefined, model: d.Model || undefined, trim: d.Trim || d.Series || undefined, body: d.BodyClass || undefined };
  } catch { return null; }
}
export const vehicleLabel = (v: Vehicle | null | undefined) => (v ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') : '');
