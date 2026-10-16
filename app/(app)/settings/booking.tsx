'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Copy, Check, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { DURATIONS, durationLabel } from '@/lib/services';
import { gbp } from '@/lib/format';
import type { Garage } from '@/lib/types';
import { deleteService, saveBookingSettings, saveService } from './more-actions';

export type OnlineService = { id: string; name: string; duration_minutes: number; price_from_pence: number | null; description: string | null };

export function BookingTab({ g, services, link }: { g: Garage; services: OnlineService[]; link: string }) {
  const settings = useActionToast(saveBookingSettings);
  const svc = useActionToast(saveService);
  const [on, setOn] = useState(g.online_booking_enabled);
  const [editing, setEditing] = useState<OnlineService | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastTs, setLastTs] = useState<number | undefined>();
  if (svc.state.ts !== lastTs) { setLastTs(svc.state.ts); if (svc.state.ok) { setEditing(null); setAdding(false); } }

  return (
    <div className="space-y-6">
      <form suppressHydrationWarning action={settings.formAction}>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Online booking</CardTitle>
            <CardDescription>Let customers book themselves into free slots, 24 hours a day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="online_booking_enabled" className="text-base">Accept online bookings</Label>
                <p className="text-sm text-muted-foreground">
                  {on ? 'Customers can book the services below. Bookings appear in your diary straight away.' : 'Your booking page shows a “call us” message.'}
                </p>
              </div>
              <Switch id="online_booking_enabled" name="online_booking_enabled" checked={on} onCheckedChange={setOn} />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Your booking page:</span>
              <span className="min-w-0 flex-1 truncate font-medium">{link}</span>
              <Button type="button" size="sm" variant="outline" onClick={async () => {
                try { await navigator.clipboard.writeText(link); setCopied(true); toast.success('Link copied'); setTimeout(() => setCopied(false), 2000); }
                catch { toast.error('Could not copy'); }
              }}>{copied ? <Check /> : <Copy />} Copy</Button>
              <Button type="button" size="sm" variant="ghost" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Minimum notice" htmlFor="booking_lead_hours" error={settings.err('booking_lead_hours')} hint="How soon someone can book.">
                <div className="relative">
                  <Input id="booking_lead_hours" name="booking_lead_hours" type="number" min={0} max={168} defaultValue={g.booking_lead_hours} className="pr-14" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">hours</span>
                </div>
              </Field>
              <Field label="Book up to" htmlFor="booking_days_ahead" error={settings.err('booking_days_ahead')} hint="How far ahead the diary is open.">
                <div className="relative">
                  <Input id="booking_days_ahead" name="booking_days_ahead" type="number" min={1} max={120} defaultValue={g.booking_days_ahead} className="pr-24" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days ahead</span>
                </div>
              </Field>
            </div>
            <Field label="Message on the booking page" htmlFor="booking_message" error={settings.err('booking_message')} optional>
              <Textarea id="booking_message" name="booking_message" rows={2} defaultValue={g.booking_message ?? ''}
                placeholder="e.g. Free collection and delivery within 3 miles." />
            </Field>
            <p className="text-xs text-muted-foreground">Opening hours, open days and bays (Settings → Workshop) decide which slots are offered.</p>
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button type="submit" disabled={settings.pending}>{settings.pending && <Loader2 className="animate-spin" />} Save changes</Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Services customers can book</CardTitle>
          <CardDescription>The duration sets how long each booking blocks out a bay.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {services.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {durationLabel(s.duration_minutes)}{s.price_from_pence != null ? ` · from ${gbp(s.price_from_pence)}` : ''}{s.description ? ` · ${s.description}` : ''}
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Edit" onClick={() => { setEditing(s); setAdding(false); }}><Pencil className="size-3.5" /></Button>
                  <form suppressHydrationWarning action={deleteService}>
                    <input suppressHydrationWarning type="hidden" name="id" value={s.id} />
                    <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="size-3.5" /></Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {editing || adding ? (
            <form suppressHydrationWarning action={svc.formAction} key={editing?.id ?? 'new'} className="space-y-4 rounded-lg border bg-muted/30 p-4">
              {editing && <input suppressHydrationWarning type="hidden" name="id" value={editing.id} />}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{editing ? 'Edit service' : 'Add a service'}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setAdding(false); }}><X /> Close</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name" htmlFor="name" error={svc.err('name')}>
                  <Input id="name" name="name" defaultValue={editing?.name ?? ''} placeholder="MOT" autoFocus />
                </Field>
                <Field label="Duration" htmlFor="duration_minutes" error={svc.err('duration_minutes')}>
                  <NativeSelect id="duration_minutes" name="duration_minutes" defaultValue={editing?.duration_minutes ?? 60}>
                    {DURATIONS.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Price from £" htmlFor="price_from" error={svc.err('price_from')} optional>
                  <Input id="price_from" name="price_from" inputMode="decimal" placeholder="54.85"
                    defaultValue={editing?.price_from_pence != null ? (editing.price_from_pence / 100).toFixed(2) : ''} />
                </Field>
                <Field label="Short description" htmlFor="description" optional className="sm:col-span-3">
                  <Input id="description" name="description" defaultValue={editing?.description ?? ''} placeholder="e.g. Class 4 MOT while you wait" maxLength={120} />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={svc.pending}>{svc.pending && <Loader2 className="animate-spin" />}{editing ? 'Update service' : 'Add service'}</Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="outline" onClick={() => setAdding(true)}><Plus /> Add a service</Button>
          )}
          {services.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground">Add at least one service (for example MOT, Full service) before turning online booking on.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
