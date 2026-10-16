'use client';

import { useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import type { Garage } from '@/lib/types';
import { saveReminderSettings } from './more-actions';

export function RemindersTab({ g, emailOn, cronOn }: { g: Garage; emailOn: boolean; cronOn: boolean }) {
  const { formAction, pending, err } = useActionToast(saveReminderSettings);
  const [on, setOn] = useState(g.reminders_enabled);
  const ready = emailOn && cronOn;
  return (
    <form suppressHydrationWarning action={formAction}>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Automatic reminders</CardTitle>
          <CardDescription>Email customers before their MOT or service is due. Only customers who agreed to reminders are contacted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!ready && (
            <Alert>
              <Info />
              <AlertDescription>
                Automatic emails need email sending{!cronOn ? ' and the service key' : ''} set up on the server (see the README).
                Until then, use the Reminders page to send WhatsApp reminders in one tap.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="reminders_enabled" className="text-base">Send reminder emails</Label>
              <p className="text-sm text-muted-foreground">{on ? 'Sent once a day, each with a link to book and to unsubscribe.' : 'No automatic emails are sent.'}</p>
            </div>
            <Switch id="reminders_enabled" name="reminders_enabled" checked={on} onCheckedChange={setOn} />
          </div>
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
            A vehicle’s service-due date is set 12 months after a job that includes a service, and can be changed on the vehicle.
          </p>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save changes</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
