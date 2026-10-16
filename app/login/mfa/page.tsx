import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { needsCode } from '@/lib/mfa';
import { CodeForm } from './code-form';

export const metadata = { title: 'Enter your code' };

async function signOut() {
  'use server';
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/login');
}

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const safe = next && /^\/(?!\/)/.test(next) ? next : '/';
  if (!(await needsCode(sb, user))) redirect(safe);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></span>
          <CardTitle className="text-xl">Two-factor login</CardTitle>
          <CardDescription>Open your authenticator app and enter the 6-digit code for {user.email}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeForm next={safe} />
          <form suppressHydrationWarning action={signOut} className="text-center">
            <button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Sign out</button>
          </form>
          <p className="text-center text-xs text-muted-foreground">Lost your phone? Ask the garage owner to reset two-factor for you.</p>
        </CardContent>
      </Card>
    </div>
  );
}
