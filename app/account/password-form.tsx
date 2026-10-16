'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { changePassword } from './actions';

export function PasswordForm({ autoFocus }: { autoFocus?: boolean }) {
  const { formAction, pending, err, state } = useActionToast(changePassword);
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'pw'} className="grid gap-4 sm:grid-cols-2">
      <Field label="New password" htmlFor="password" error={err('password')}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} autoFocus={autoFocus} />
      </Field>
      <Field label="Type it again" htmlFor="confirm" error={err('confirm')}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" />
      </Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Change password</Button></div>
    </form>
  );
}
