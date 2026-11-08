import { redirect } from 'next/navigation';
import { privateMeta } from '@/lib/og';
import { BellOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = () => privateMeta('Stop reminders', 'Reminder settings');

async function unsubscribe(fd: FormData) {
  'use server';
  const token = String(fd.get('token'));
  const sb = await createClient();
  const { data } = await sb.rpc('unsubscribe', { p_token: token });
  redirect(`/u/${token}?done=${encodeURIComponent((data as string | null) ?? '1')}`);
}

// A button (not an automatic unsubscribe) so email scanners that open links don't opt people out by accident
export default async function UnsubscribePage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(token);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {done ? <Check className="size-6" /> : <BellOff className="size-6" />}
          </span>
          <CardTitle>{done ? 'Reminders stopped' : 'Stop MOT and service reminders?'}</CardTitle>
          <CardDescription>
            {done
              ? `You won’t get any more reminder emails${done !== '1' ? ` from ${done}` : ''}. You can ask the garage to turn them back on at any time.`
              : 'You’ll no longer receive reminder emails from this garage.'}
          </CardDescription>
        </CardHeader>
        {!done && valid && (
          <CardContent>
            <form suppressHydrationWarning action={unsubscribe}>
              <input suppressHydrationWarning type="hidden" name="token" value={token} />
              <Button className="w-full" size="lg">Stop reminders</Button>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
