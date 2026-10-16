'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionToast } from '@/components/use-action-toast';
import { verifyLoginCode } from '@/app/account/actions';

export function CodeForm({ next }: { next: string }) {
  const { formAction, pending, err } = useActionToast(verifyLoginCode);
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} autoFocus
        placeholder="123 456" className="h-12 text-center text-2xl tracking-[0.3em]" aria-label="6-digit code" aria-invalid={!!err('code')} />
      {err('code') && <p className="text-center text-xs text-destructive">{err('code')}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Continue</Button>
    </form>
  );
}
