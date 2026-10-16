import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ShieldCheck, Trash2, KeyRound, LogOut } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { ThemeToggle } from '@/components/theme-toggle';
import { createClient } from '@/lib/supabase/server';
import { ukDate } from '@/lib/format';
import { MfaSetup } from './mfa-setup';
import { PasswordForm } from './password-form';
import { removeFactor, signOutEverywhere } from './actions';

export const metadata = { title: 'Your account' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ setup?: string; reset?: string }> }) {
  const { setup, reset } = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: factors } = await sb.auth.mfa.listFactors();
  const totp = (factors?.totp ?? []).filter((f) => f.status === 'verified');

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Back to the garage</Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-2xl space-y-6 p-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>

        {setup && !totp.length && (
          <Alert><ShieldCheck /><AlertDescription>Your garage requires two-factor login for your role. Set it up below to carry on.</AlertDescription></Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Two-factor login
              {totp.length > 0 ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success">On</Badge> : <Badge variant="outline">Off</Badge>}
            </CardTitle>
            <CardDescription>A 6-digit code from your phone as well as your password, so a stolen password alone can’t get in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {totp.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {totp.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="flex-1">{f.friendly_name ?? 'Authenticator app'}<span className="block text-xs text-muted-foreground">Added {ukDate(f.created_at)}</span></span>
                    <form suppressHydrationWarning action={removeFactor}>
                      <input type="hidden" name="factor_id" value={f.id} />
                      <ConfirmSubmit variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        message="Remove this authenticator? If it's your only one, two-factor login will be off.">
                        <Trash2 /> Remove
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {totp.length > 0
              ? <details><summary className="cursor-pointer text-sm text-muted-foreground">Add a second phone as a backup</summary><div className="pt-3"><MfaSetup /></div></details>
              : <MfaSetup />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Password</CardTitle>
            {reset && <CardDescription>Choose a new password for your account.</CardDescription>}
          </CardHeader>
          <CardContent><PasswordForm autoFocus={!!reset} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signed in elsewhere?</CardTitle>
            <CardDescription>Sign out on every phone, tablet and computer, for example after losing a device.</CardDescription>
          </CardHeader>
          <CardContent>
            <form suppressHydrationWarning action={signOutEverywhere}>
              <Button type="submit" variant="outline"><LogOut /> Sign out everywhere</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
