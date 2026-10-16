import { PRODUCT_NAME } from '@/lib/brand';
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
import { siteOrigin } from '@/lib/url';
import { needsCode } from '@/lib/mfa';

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
  if (error) {
    const unconfirmed = /not confirmed/i.test(error.message);
    redirect(`/login?${unconfirmed ? `mode=check&email=${encodeURIComponent(String(fd.get('email')).trim())}&` : ''}error=` + encodeURIComponent(
      unconfirmed ? 'Please confirm your email address first. We can send the link again.' : error.message) + (next ? `&next=${encodeURIComponent(next)}` : ''));
  }
  // two-factor: ask for the code before anything else
  const { data: { user } } = await supabase.auth.getUser();
  if (await needsCode(supabase, user)) redirect(`/login/mfa${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  redirect(next ?? '/');
}

async function signUp(fd: FormData) {
  'use server';
  const next = safeNext(fd.get('next'));
  const supabase = await createClient();
  const email = String(fd.get('email')).trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: String(fd.get('password')),
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next ?? '/onboarding')}` },
  });
  if (error) redirect('/login?mode=signup&error=' + encodeURIComponent(error.message) + (next ? `&next=${encodeURIComponent(next)}` : ''));
  // "Confirm email" switched on in Supabase: no session until they click the link
  if (!data.session) redirect(`/login?mode=check&email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  redirect(next ?? '/onboarding');
}

async function resendConfirmation(fd: FormData) {
  'use server';
  const next = safeNext(fd.get('next'));
  const email = String(fd.get('email') ?? '').trim();
  const supabase = await createClient();
  await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next ?? '/onboarding')}` } });
  redirect(`/login?mode=check&sent=1&email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
}

async function sendReset(fd: FormData) {
  'use server';
  const email = String(fd.get('email') ?? '').trim();
  const supabase = await createClient();
  // same answer whether or not the account exists
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent('/account?reset=1')}` });
  redirect(`/login?mode=forgot&sent=1&email=${encodeURIComponent(email)}`);
}

const FEATURES = [
  { icon: CalendarCheck, text: 'MOT and service diary with online booking' },
  { icon: Wrench, text: 'Digital job cards for mechanics on any tablet' },
  { icon: Receipt, text: 'Estimates and invoices in a couple of clicks' },
  { icon: BellRing, text: 'Automatic MOT and service reminders' },
];

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; mode?: string; next?: string; email?: string; sent?: string }> }) {
  const { error, mode, next, email, sent } = await searchParams;
  const tenant = await getTenant();
  // sign-up is for new garages, or staff arriving from an invite link
  const signingUp = mode === 'signup' && (!tenant || !!next);
  const name = tenant?.name ?? PRODUCT_NAME;

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
          {mode === 'check' ? (
            <form suppressHydrationWarning action={resendConfirmation} className="w-full max-w-sm space-y-6">
              {next && <input type="hidden" name="next" value={next} />}
              <input type="hidden" name="email" value={email ?? ''} />
              <div className="space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  We’ve sent a link to <b className="text-foreground">{email}</b>. Click it to confirm your address and carry on.
                </p>
              </div>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {sent && <Alert><AlertDescription>Sent again. It can take a minute; check your spam folder too.</AlertDescription></Alert>}
              <Button type="submit" variant="outline" className="w-full">Send the link again</Button>
              <p className="text-center text-sm"><Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">Back to sign in</Link></p>
            </form>
          ) : mode === 'forgot' ? (
            <form suppressHydrationWarning action={sendReset} className="w-full max-w-sm space-y-6">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
                <p className="text-sm text-muted-foreground">We’ll email you a link to choose a new one.</p>
              </div>
              {sent ? (
                <Alert><AlertDescription>If there’s an account for {email}, a reset link is on its way. Check your spam folder too.</AlertDescription></Alert>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
                  </div>
                  <Button type="submit" className="w-full" size="lg">Send reset link</Button>
                </>
              )}
              <p className="text-center text-sm"><Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">Back to sign in</Link></p>
            </form>
          ) : (
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!signingUp && <Link href="/login?mode=forgot" className="text-xs text-muted-foreground underline-offset-4 hover:underline">Forgot password?</Link>}
              </div>
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
          )}
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
          {tenant && <p className="text-xs opacity-70">Powered by {PRODUCT_NAME}</p>}
        </div>
      </div>
    </div>
  );
}
