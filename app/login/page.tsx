import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarCheck, Wrench, Receipt, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ThemeToggle } from '@/components/theme-toggle';
import { GarageLogo } from '@/components/garage-logo';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/tenant';

export const metadata = { title: 'Sign in' };

// only allow same-site paths
const safeNext = (v: FormDataEntryValue | null) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : null);

async function signIn(fd: FormData) {
  'use server';
  const next = safeNext(fd.get('next'));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get('email')).trim(),
    password: String(fd.get('password')),
  });
  if (error) redirect('/login?error=' + encodeURIComponent(error.message) + (next ? `&next=${encodeURIComponent(next)}` : ''));
  redirect(next ?? '/');
}

async function signUp(fd: FormData) {
  'use server';
  const next = safeNext(fd.get('next'));
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: String(fd.get('email')).trim(),
    password: String(fd.get('password')),
  });
  if (error) redirect('/login?mode=signup&error=' + encodeURIComponent(error.message) + (next ? `&next=${encodeURIComponent(next)}` : ''));
  redirect(next ?? '/onboarding');
}

const FEATURES = [
  { icon: CalendarCheck, text: 'MOT and service diary with online booking' },
  { icon: Wrench, text: 'Digital job cards for mechanics on any tablet' },
  { icon: Receipt, text: 'Estimates and invoices in a couple of clicks' },
  { icon: BellRing, text: 'Automatic MOT and service reminders' },
];

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; mode?: string; next?: string }> }) {
  const { error, mode, next } = await searchParams;
  const tenant = await getTenant();
  // sign-up is for new garages, or staff arriving from an invite link
  const signingUp = mode === 'signup' && (!tenant || !!next);
  const name = tenant?.name ?? 'RampDesk';

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <GarageLogo name={name} logoUrl={tenant?.logo_url} />
            {name}
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <form suppressHydrationWarning className="w-full max-w-sm space-y-6">
            {next && <input suppressHydrationWarning type="hidden" name="next" value={next} />}
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                {signingUp ? 'Create your account' : 'Welcome back'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {signingUp ? (next ? 'Choose a password to finish joining.' : 'Get your garage set up in a few minutes.') : `Sign in to ${name}`}
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} required
                autoComplete={signingUp ? 'new-password' : 'current-password'} />
            </div>

            <Button className="w-full" size="lg" formAction={signingUp ? signUp : signIn}>
              {signingUp ? 'Create account' : 'Sign in'}
            </Button>

            {!tenant && (
              <p className="text-center text-sm text-muted-foreground">
                {signingUp ? 'Already have an account? ' : 'New garage? '}
                <Link href={`${signingUp ? '/login' : '/login?mode=signup'}${next ? `${signingUp ? '?' : '&'}next=${encodeURIComponent(next)}` : ''}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline">
                  {signingUp ? 'Sign in' : 'Create an account'}
                </Link>
              </p>
            )}
          </form>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground dark:bg-sidebar dark:text-sidebar-foreground lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative max-w-md space-y-8">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Run the whole workshop from one screen.
          </h2>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 dark:bg-primary/20 dark:text-primary">
                  <f.icon className="size-4" />
                </span>
                <span className="text-sm">{f.text}</span>
              </li>
            ))}
          </ul>
          {tenant && <p className="text-xs opacity-70">Powered by RampDesk</p>}
        </div>
      </div>
    </div>
  );
}
