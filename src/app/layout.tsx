import type { Metadata } from 'next';
import './globals.css';

const name = process.env.APP_NAME || 'Supplement Desk';
export const metadata: Metadata = { title: { default: name, template: `%s · ${name}` }, description: 'Supplement review for collision repair shops', robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
