'use client';

import { useState, useTransition } from 'react';
import { Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionToast } from '@/components/use-action-toast';
import { confirmEnrolment, startEnrolment } from './actions';

/** QR code → enter a code → two-factor is on */
export function MfaSetup() {
  const [enrol, setEnrol] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState('');
  const [starting, start] = useTransition();
  const { formAction, pending, err } = useActionToast(confirmEnrolment);

  if (!enrol) {
    return (
      <div className="space-y-3">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or similar.</li>
          <li>Scan the QR code we show you.</li>
          <li>Type in the 6-digit code it gives you.</li>
        </ol>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={starting} onClick={() => start(async () => {
          const r = await startEnrolment();
          if ('error' in r) setError(r.error); else { setError(''); setEnrol(r); }
        })}>{starting ? <Loader2 className="animate-spin" /> : <Smartphone />} Set up two-factor login</Button>
      </div>
    );
  }

  return (
    <form suppressHydrationWarning action={formAction} className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
      <input type="hidden" name="factor_id" value={enrol.factorId} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrol.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg border bg-white p-2" />
      <div className="space-y-3">
        <p className="text-sm">Scan this with your authenticator app, then enter the code it shows.</p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Can’t scan? Type this key instead</summary>
          <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-foreground">{enrol.secret}</code>
        </details>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456"
          className="h-11 max-w-48 text-center text-xl tracking-[0.25em]" aria-label="6-digit code" aria-invalid={!!err('code')} autoFocus />
        {err('code') && <p className="text-xs text-destructive">{err('code')}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Turn on</Button>
          <Button type="button" variant="ghost" onClick={() => setEnrol(null)}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
