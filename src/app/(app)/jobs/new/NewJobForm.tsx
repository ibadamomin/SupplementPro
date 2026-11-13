'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function NewJobForm({ shops, pickShop }: { shops: { id: string; name: string; insurers: string[] }[]; pickShop: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shopId, setShopId] = useState(shops[0]?.id ?? '');
  const [photoCount, setPhotoCount] = useState(0);
  const insurers = shops.find((s) => s.id === shopId)?.insurers ?? [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/jobs', { method: 'POST', body: new FormData(e.currentTarget) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Upload failed. Please try again.');
      router.push(`/jobs/${out.id}`);
    } catch (err: any) { setError(err.message); setBusy(false); }
  }
  if (!shops.length) return <div className="card card-pad text-sm">Create a shop first under Shops.</div>;
  return (
    <form onSubmit={submit} className="card card-pad space-y-5">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {pickShop && (
        <label className="block"><span className="label">Shop</span>
          <select name="shop_id" className="input" value={shopId} onChange={(e) => setShopId(e.target.value)}>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      )}
      <label className="block"><span className="label">Insurer's estimate (PDF) *</span>
        <input className="input" type="file" name="estimate" accept="application/pdf,.pdf" required />
        <span className="muted mt-1 block text-xs">Export or print the estimate to PDF from your estimating system. Up to 25 MB.</span></label>
      <label className="block"><span className="label">Teardown photos</span>
        <input className="input" type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)} />
        <span className="muted mt-1 block text-xs">{photoCount ? `${photoCount} selected. ` : ''}Up to 30 photos. Clear shots of hidden damage, labels and sensors help the most.</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">VIN</span><input className="input uppercase" name="vin" maxLength={17} placeholder="Read from the estimate if left blank" /></label>
        <label className="block"><span className="label">Repair order number</span><input className="input" name="ro_number" /></label>
        <label className="block"><span className="label">Insurer</span><input className="input" name="insurer" list="insurers" placeholder="Read from the estimate if left blank" /><datalist id="insurers">{insurers.map((i) => <option key={i} value={i} />)}</datalist></label>
        <label className="block"><span className="label">Claim number</span><input className="input" name="claim_number" /></label>
        <label className="block sm:col-span-2"><span className="label">Adjuster name</span><input className="input" name="adjuster" /></label>
      </div>
      <label className="block"><span className="label">Notes for the estimator</span>
        <textarea className="input" name="notes" rows={3} placeholder="Anything found at teardown that the photos do not show" /></label>
      <div className="flex items-center justify-end gap-3">
        {busy && <span className="muted text-sm">Uploading and encrypting files…</span>}
        <button className="btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload job'}</button>
      </div>
    </form>
  );
}
