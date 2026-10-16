'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { useActionToast } from '@/components/use-action-toast';
import { resetMemberMfa, saveSecurity } from './extra-actions';

export type MemberMfa = { user_id: string; display_name: string; role: string; enabled: boolean };

const ROLES = [
  { key: 'owner', label: 'Owners', hint: 'Settings, staff, bank details, voiding and credit notes' },
  { key: 'reception', label: 'Reception', hint: 'Customers, prices, invoices and payments' },
  { key: 'mechanic', label: 'Mechanics', hint: 'Usually off: mechanics often share a workshop tablet' },
];

export function SecurityTab({ required, members, selfId, canReset }: { required: string[]; members: MemberMfa[]; selfId: string; canReset: boolean }) {
  const { formAction, pending } = useActionToast(saveSecurity);
  const [on, setOn] = useState<string[]>(required);
  return (
    <div className="space-y-6">
      <form suppressHydrationWarning action={formAction}>
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> Two-factor login</CardTitle>
            <CardDescription>
              Staff sign in with their password and a 6-digit code from an app on their phone. Choose who must use it;
              anyone else can still turn it on for themselves under Account and security.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ROLES.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5">
                <input type="checkbox" name={`mfa_${r.key}`} checked={on.includes(r.key)} className="mt-1 size-4 accent-primary"
                  onChange={(e) => setOn((x) => (e.target.checked ? [...x, r.key] : x.filter((k) => k !== r.key)))} />
                <span><span className="block text-sm font-medium">Require for {r.label}</span><span className="text-sm text-muted-foreground">{r.hint}</span></span>
              </label>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">People who haven’t set it up are asked to do so the next time they open the app.</p>
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Who has it on</CardTitle>
          <CardDescription>If someone loses their phone, reset their two-factor so they can sign in and set it up again.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((mm) => (
              <li key={mm.user_id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{mm.display_name}</span>
                  <span className="ml-2 text-xs capitalize text-muted-foreground">{mm.role}</span>
                </span>
                {mm.enabled
                  ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success">On</Badge>
                  : <Badge variant="outline" className={on.includes(mm.role) ? 'border-warning/40 text-warning-foreground dark:text-warning' : ''}>{on.includes(mm.role) ? 'Needs set-up' : 'Off'}</Badge>}
                {mm.enabled && mm.user_id !== selfId && canReset && (
                  <form suppressHydrationWarning action={resetMemberMfa}>
                    <input type="hidden" name="user_id" value={mm.user_id} />
                    <ConfirmSubmit variant="ghost" size="sm" message={`Reset two-factor for ${mm.display_name}? They’ll sign in with just their password and set it up again.`}>
                      <RotateCcw /> Reset
                    </ConfirmSubmit>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {!canReset && <p className="pt-3 text-xs text-muted-foreground">Resetting needs the service key on the server (see the README).</p>}
          <p className="pt-3 text-sm"><Link href="/account" className="font-medium underline-offset-4 hover:underline">Set up your own two-factor login</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}
