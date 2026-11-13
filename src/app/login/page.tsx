import { redirect } from 'next/navigation';
import { Flash } from '@/components/ui';
import { Submit } from '@/components/client';
import { loginAction } from '@/lib/actions';
import { getUser } from '@/lib/auth';
import { APP_NAME } from '@/lib/mailer';

export const metadata = { title: 'Sign in' };
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (await getUser()) redirect('/');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">S</div>
          <h1>{APP_NAME}</h1>
          <p className="muted mt-1 text-sm">Sign in to your account</p>
        </div>
        <form action={loginAction} className="card card-pad space-y-4">
          <Flash sp={await searchParams} />
          <label className="block"><span className="label">Email</span><input className="input" type="email" name="email" autoComplete="email" required autoFocus /></label>
          <label className="block"><span className="label">Password</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label>
          <Submit className="btn-primary w-full" pending="Signing in…">Sign in</Submit>
        </form>
      </div>
    </main>
  );
}
