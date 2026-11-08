'use client';

import { useState } from 'react';
import { Loader2, UserPlus, Copy, Check, Trash2, ShieldCheck, Headset, Wrench } from 'lucide-react';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { initials, ukDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { createInvite, revokeInvite, updateMember } from './staff-actions';

export type Member = { user_id: string; display_name: string; email: string | null; role: string; active: boolean };
export type Invite = { id: string; display_name: string; email: string | null; role: string; token: string; expires_at: string };

const ROLES = [
  { value: 'owner', label: 'Owner', icon: ShieldCheck, desc: 'Everything, including settings, staff and voiding invoices.' },
  { value: 'reception', label: 'Reception', icon: Headset, desc: 'Diary, customers, job pricing, invoices and payments.' },
  { value: 'mechanic', label: 'Mechanic', icon: Wrench, desc: 'Their jobs, work lines, photos and clocking. No prices or invoices.' },
];

function MemberRow({ m, self }: { m: Member; self: boolean }) {
  const { formAction, pending } = useActionToast(updateMember);
  const [role, setRole] = useState(m.role);
  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-3 py-3', !m.active && 'opacity-60')}>
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(m.display_name)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {m.display_name}
          {self && <Badge variant="secondary">You</Badge>}
          {!m.active && <Badge variant="outline">Deactivated</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{m.email ?? ''}</div>
      </div>
      <form suppressHydrationWarning action={formAction} className="flex items-center gap-2">
        <input suppressHydrationWarning type="hidden" name="user_id" value={m.user_id} />
        <input suppressHydrationWarning type="hidden" name="active" value={m.active ? '1' : '0'} />
        <NativeSelect name="role" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="h-8 w-32">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </NativeSelect>
        {role !== m.role && <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>}
      </form>
      <form suppressHydrationWarning action={formAction}>
        <input suppressHydrationWarning type="hidden" name="user_id" value={m.user_id} />
        <input suppressHydrationWarning type="hidden" name="role" value={m.role} />
        <input suppressHydrationWarning type="hidden" name="active" value={m.active ? '0' : '1'} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending || self}
          className={m.active ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : ''}>
          {m.active ? 'Deactivate' : 'Reactivate'}
        </Button>
      </form>
    </li>
  );
}

function InviteRow({ i, origin, garage }: { i: Invite; origin: string; garage: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${origin}/join/${i.token}`;
  const msg = `Hi ${i.display_name.split(' ')[0]}, here's your link to set up your ${garage} login: ${link}`;
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{i.display_name} <span className="font-normal text-muted-foreground capitalize">· {i.role}</span></div>
        <div className="truncate text-xs text-muted-foreground">{i.email ? `${i.email} · ` : ''}Expires {ukDate(i.expires_at)}</div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); toast.success('Invite link copied'); setTimeout(() => setCopied(false), 2000); }
        catch { toast.error('Could not copy the link'); }
      }}>{copied ? <Check /> : <Copy />} Copy link</Button>
      <Button variant="whatsapp" size="sm" asChild>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><WhatsAppIcon className="size-4" /> WhatsApp</a>
      </Button>
      <form suppressHydrationWarning action={revokeInvite}>
        <input suppressHydrationWarning type="hidden" name="id" value={i.id} />
        <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Cancel invite"><Trash2 className="size-4" /></Button>
      </form>
    </li>
  );
}

export function StaffTab({
  members, invites, selfId, origin, garage, emailOn,
}: { members: Member[]; invites: Invite[]; selfId: string; origin: string; garage: string; emailOn: boolean }) {
  const { formAction, pending, err, state } = useActionToast(createInvite);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Staff</CardTitle>
          <CardDescription>Everyone with a login for this garage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y rounded-lg border">
            {members.map((m) => <MemberRow key={m.user_id} m={m} self={m.user_id === selfId} />)}
          </ul>
          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r.value} className="rounded-lg bg-muted/50 p-3 text-xs">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium"><r.icon className="size-4" />{r.label}</div>
                <p className="text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            They get a link to create their own login. {emailOn ? 'Add their email to send it automatically.' : 'Send it by WhatsApp or copy it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'f'} className="grid gap-4 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
            <Field label="Name" htmlFor="display_name" error={err('display_name')}>
              <Input id="display_name" name="display_name" placeholder="e.g. Kasun Perera" aria-invalid={!!err('display_name')} />
            </Field>
            <Field label="Role" htmlFor="role">
              <NativeSelect id="role" name="role" defaultValue="mechanic">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Email" htmlFor="email" error={err('email')} optional>
              <Input id="email" name="email" type="email" aria-invalid={!!err('email')} />
            </Field>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite</Button>
          </form>
          {invites.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Waiting to join</p>
              <ul className="divide-y rounded-lg border">
                {invites.map((i) => <InviteRow key={i.id} i={i} origin={origin} garage={garage} />)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
