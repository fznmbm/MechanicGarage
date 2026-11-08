'use client';

import { useRef, useState } from 'react';
import { Loader2, Info, RotateCcw, Mail, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { WhatsAppBubble } from '@/components/whatsapp-bubble';
import { useActionToast } from '@/components/use-action-toast';
import { DEFAULT_MESSAGES, MESSAGE_FIELDS, reminderMessage, type ReminderKind } from '@/lib/reminders';
import { cn } from '@/lib/utils';
import type { Garage } from '@/lib/types';
import { saveReminderSettings } from './more-actions';

type Channel = 'whatsapp' | 'both' | 'email';

const CHANNELS: { value: Channel; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'whatsapp', title: 'WhatsApp', icon: <WhatsAppIcon className="size-5 text-[#128C7E]" />,
    desc: 'Customers with a mobile go on your WhatsApp send list. Customers with only an email are emailed automatically.',
  },
  {
    value: 'both', title: 'WhatsApp and email', icon: <Layers className="size-5 text-primary" />,
    desc: 'Customers with a mobile go on the send list, and everyone with an email is also emailed.',
  },
  {
    value: 'email', title: 'Email only', icon: <Mail className="size-5 text-primary" />,
    desc: 'Automatic emails only. No WhatsApp send list.',
  },
];

const KINDS: { key: ReminderKind; label: string }[] = [
  { key: 'mot', label: 'MOT' },
  { key: 'service', label: 'Service' },
  { key: 'advisory', label: 'MOT advisories' },
];

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function RemindersTab({ g, emailOn, cronOn, bookUrl }: { g: Garage; emailOn: boolean; cronOn: boolean; bookUrl: string | null }) {
  const { formAction, pending, err } = useActionToast(saveReminderSettings);
  const [on, setOn] = useState(g.reminders_enabled);
  const [channel, setChannel] = useState<Channel>((g.reminder_channel as Channel) ?? 'whatsapp');
  const [kind, setKind] = useState<ReminderKind>('mot');
  const [text, setText] = useState<Record<ReminderKind, string>>({
    mot: g.msg_mot?.trim() || DEFAULT_MESSAGES.mot,
    service: g.msg_service?.trim() || DEFAULT_MESSAGES.service,
    advisory: g.msg_advisory?.trim() || DEFAULT_MESSAGES.advisory,
  });
  const boxes = useRef<Partial<Record<ReminderKind, HTMLTextAreaElement | null>>>({});

  // put a fill-in where the cursor is
  const insert = (key: string) => {
    const el = boxes.current[kind];
    const tag = `{${key}}`;
    const at = el?.selectionStart ?? text[kind].length;
    const end = el?.selectionEnd ?? at;
    const next = text[kind].slice(0, at) + tag + text[kind].slice(end);
    setText({ ...text, [kind]: next });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + tag.length, at + tag.length); });
  };

  const preview = reminderMessage({
    kind, template: text[kind], firstName: 'Sarah', garage: g.name, phone: g.phone, registration: 'AB12CDE', make: 'Ford',
    due: plusDays(kind === 'mot' ? 21 : 12), bookUrl,
    advisories: ['Nearside front tyre worn close to legal limit', 'Brake pipe slightly corroded'],
  });

  return (
    <form suppressHydrationWarning action={formAction} className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Automatic reminders</CardTitle>
          <CardDescription>
            Each morning, customers with an MOT or service coming up are added to the send list on the Reminders page, ready to send in one tap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="reminders_enabled" className="text-base">Reminders on</Label>
              <p className="text-sm text-muted-foreground">
                {on ? 'Only customers who agreed to reminders are included. Anyone already booked in is skipped.' : 'No reminders are prepared or sent.'}
              </p>
            </div>
            <Switch id="reminders_enabled" name="reminders_enabled" checked={on} onCheckedChange={setOn} />
          </div>

          <fieldset className={cn('space-y-3', !on && 'opacity-60')} disabled={!on}>
            <legend className="mb-3 text-sm font-medium">How to send</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {CHANNELS.map((c) => (
                <label key={c.value}
                  className={cn('flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                    channel === c.value ? 'border-primary bg-primary/5' : 'hover:bg-accent/50')}>
                  <input type="radio" name="reminder_channel" value={c.value} checked={channel === c.value}
                    onChange={() => setChannel(c.value)} className="sr-only" />
                  <span className="flex items-center gap-2 font-medium">
                    {c.icon} {c.title}
                    {c.value === 'whatsapp' && <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Recommended</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">{c.desc}</span>
                </label>
              ))}
            </div>
            {channel !== 'whatsapp' && !(emailOn && cronOn) && (
              <Alert>
                <Info />
                <AlertDescription>
                  Automatic emails aren’t set up on the server yet{!cronOn ? ' (email sending and the service key)' : ' (email sending)'}, so for now only the WhatsApp send list is used.
                </AlertDescription>
              </Alert>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="First MOT reminder" htmlFor="mot_first" error={err('mot_first')}>
              <div className="relative">
                <Input id="mot_first" name="mot_first" type="number" min={7} max={60} defaultValue={g.mot_reminder_days?.[0] ?? 30} className="pr-24" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days before</span>
              </div>
            </Field>
            <Field label="Second MOT reminder" htmlFor="mot_second" error={err('mot_second')} hint="0 to send only one.">
              <div className="relative">
                <Input id="mot_second" name="mot_second" type="number" min={0} max={59} defaultValue={g.mot_reminder_days?.[1] ?? 0} className="pr-24" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days before</span>
              </div>
            </Field>
            <Field label="Service reminder" htmlFor="service_reminder_days" error={err('service_reminder_days')}>
              <div className="relative">
                <Input id="service_reminder_days" name="service_reminder_days" type="number" min={1} max={60} defaultValue={g.service_reminder_days ?? 14} className="pr-24" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days before</span>
              </div>
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            If an MOT runs out without being booked, one more “MOT expired” reminder is added. A vehicle’s service-due date is set 12 months after a
            job that includes a service, and can be changed on the vehicle.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Message wording</CardTitle>
          <CardDescription>What customers receive on WhatsApp. Tap a fill-in to add it; lines with nothing to fill in (e.g. no booking link) are left out.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {KINDS.map((k) => (
              <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} onClick={() => setKind(k.key)}
                className={cn('rounded-full border px-3 py-1.5 text-sm font-medium',
                  kind === k.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              {KINDS.map((k) => (
                <Textarea key={k.key} name={`msg_${k.key}`} ref={(el) => { boxes.current[k.key] = el; }}
                  value={text[k.key]} onChange={(e) => setText({ ...text, [k.key]: e.target.value })}
                  rows={14} maxLength={1000} aria-label={`${k.label} message`}
                  className={cn('font-mono text-[13px]', kind !== k.key && 'hidden')} />
              ))}
              <div className="flex flex-wrap items-center gap-1.5">
                {[...MESSAGE_FIELDS, ...(kind === 'advisory' ? [{ key: 'advisories', label: 'Advisories' }] : [])].map((f) => (
                  <button key={f.key} type="button" onClick={() => insert(f.key)}
                    className="rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-accent">
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{text[kind].length} / 1000 · *stars* make text bold</span>
                {text[kind] !== DEFAULT_MESSAGES[kind] && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setText({ ...text, [kind]: DEFAULT_MESSAGES[kind] })}>
                    <RotateCcw /> Use our wording
                  </Button>
                )}
              </div>
              {err(`msg_${kind}`) && <p className="text-sm text-destructive">{err(`msg_${kind}`)}</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Preview</p>
              <div className="rounded-xl bg-[#efeae2] p-4 dark:bg-[#0b141a]">
                <div className="ml-auto max-w-[92%]"><WhatsAppBubble text={preview} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Example customer: Sarah, Ford AB12 CDE.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save changes</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
