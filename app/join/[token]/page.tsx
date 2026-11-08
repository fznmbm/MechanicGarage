import Link from 'next/link';
import { privateMeta } from '@/lib/og';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GarageLogo } from '@/components/garage-logo';
import { BrandStyle } from '@/components/brand-style';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = () => privateMeta('Join your garage', 'Your staff invite', 'Tap to create your login and join the team.');

type Info = { garage: string; slug: string; logo_url: string | null; brand_colour: string | null; role: string; display_name: string; email: string | null; expired: boolean; accepted: boolean };

async function accept(fd: FormData) {
  'use server';
  const token = String(fd.get('token'));
  const sb = await createClient();
  const { data, error } = await sb.rpc('accept_invite', { p_token: token });
  if (error) redirect(`/join/${token}?error=${encodeURIComponent(error.message)}`);
  redirect(`/?garage=${data}`);
}

export default async function JoinPage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const sb = await createClient();
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  const [{ data }, { data: { user } }] = await Promise.all([
    valid ? sb.rpc('invite_info', { p_token: token }) : Promise.resolve({ data: null }),
    sb.auth.getUser(),
  ]);
  const info = data as Info | null;
  const next = encodeURIComponent(`/join/${token}`);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <BrandStyle colour={info?.brand_colour} />
      <Card className="w-full max-w-md">
        {!info ? (
          <CardHeader><CardTitle>Invite not found</CardTitle><CardDescription>Check the link, or ask the garage owner for a new one.</CardDescription></CardHeader>
        ) : (
          <>
            <CardHeader className="items-center text-center">
              <GarageLogo name={info.garage} logoUrl={info.logo_url} className="mx-auto mb-2 size-12 text-base" />
              <CardTitle className="text-xl">Join {info.garage}</CardTitle>
              <CardDescription>
                Hi {info.display_name.split(' ')[0]}, you’ve been invited as <span className="font-medium capitalize text-foreground">{info.role}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {info.accepted ? (
                <>
                  <Alert><AlertDescription>This invite has already been used.</AlertDescription></Alert>
                  <Button className="w-full" asChild><Link href={`/login?garage=${info.slug}`}>Sign in</Link></Button>
                </>
              ) : info.expired ? (
                <Alert variant="destructive"><AlertDescription>This invite has expired. Ask the garage owner for a new one.</AlertDescription></Alert>
              ) : user ? (
                <form suppressHydrationWarning action={accept} className="space-y-3">
                  <input suppressHydrationWarning type="hidden" name="token" value={token} />
                  <p className="text-center text-sm text-muted-foreground">Signed in as {user.email}</p>
                  <Button className="w-full" size="lg">Join {info.garage}</Button>
                </form>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" size="lg" asChild><Link href={`/login?mode=signup&next=${next}`}>Create my login</Link></Button>
                  <Button className="w-full" variant="outline" asChild><Link href={`/login?next=${next}`}>I already have a login</Link></Button>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
