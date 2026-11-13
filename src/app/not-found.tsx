import Link from 'next/link';
export default function NotFound() {
  return (<main className="flex min-h-[60vh] items-center justify-center px-4 text-center"><div><h1>Not found</h1><p className="muted mt-2 text-sm">That page does not exist or you do not have access to it.</p><Link href="/" className="btn-secondary mt-5">Back to the dashboard</Link></div></main>);
}
