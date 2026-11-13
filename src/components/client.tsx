'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

// Submit button that disables itself and shows progress while its form action runs.
export function Submit({ children, className = 'btn-primary', pending, ...rest }: { children: ReactNode; className?: string; pending?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const s = useFormStatus();
  const mine = s.pending && (!rest.name || s.data?.get(rest.name) === rest.value);
  return <button type="submit" className={className} {...rest} disabled={s.pending || rest.disabled}>{mine && pending ? pending : children}</button>;
}
// Re-fetches the page on an interval while a job is processing.
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return null;
}
export function PrintButton() {
  return <button type="button" className="btn-secondary" onClick={() => window.print()}>Print or save as PDF</button>;
}
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return <button type="button" className="btn-secondary btn-sm" onClick={(e) => { navigator.clipboard.writeText(text); const b = e.currentTarget; b.textContent = 'Copied'; setTimeout(() => (b.textContent = label), 1500); }}>{label}</button>;
}
