'use client';

import { useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { DEFAULT_AUTHORISATION } from '@/lib/jobs';
import type { Garage } from '@/lib/types';
import { saveFeatures } from './extra-actions';

function Toggle({ name, label, hint, checked, onChange }: { name: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor={name} className="text-base">{label}</Label>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch id={name} name={name} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function FeaturesTab({ g, emailOn }: { g: Garage; emailOn: boolean }) {
  const { formAction, pending, err } = useActionToast(saveFeatures);
  const [booking, setBooking] = useState(g.notify_booking_email ?? true);
  const [ready, setReady] = useState(g.notify_ready_email ?? true);
  const [cars, setCars] = useState(g.feature_courtesy_cars ?? false);
  const [feedback, setFeedback] = useState(g.feature_feedback ?? false);
  const [autoFeedback, setAutoFeedback] = useState(g.feedback_auto_email ?? true);

  return (
    <form suppressHydrationWarning action={formAction} className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Automatic emails to customers</CardTitle>
          <CardDescription>Sent only to customers with an email address. WhatsApp buttons stay available on every booking and job.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!emailOn && (
            <Alert><Info /><AlertDescription>Email sending isn’t set up on the server yet, so these switches have no effect until it is (see the README).</AlertDescription></Alert>
          )}
          <Toggle name="notify_booking_email" label="Booking confirmation" checked={booking} onChange={setBooking}
            hint="When a booking is made, online or by your staff." />
          <Toggle name="notify_ready_email" label="Ready to collect" checked={ready} onChange={setReady}
            hint="When a job is marked ready to collect." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Optional features</CardTitle>
          <CardDescription>Turn on only what your garage uses. They can be switched off again at any time; nothing is deleted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle name="feature_courtesy_cars" label="Courtesy cars" checked={cars} onChange={setCars}
            hint="Keep a list of loan cars, who has them, when they’re due back, mileage and fuel." />
          <Toggle name="feature_feedback" label="Customer feedback and Google reviews" checked={feedback} onChange={setFeedback}
            hint="After collection, customers get a link to score the job from 1 to 5 and leave a comment, then an invitation to review you on Google." />
          {feedback && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="feedback_auto_email">Email the link automatically</Label>
                  <p className="text-sm text-muted-foreground">When a job is marked collected. Otherwise send it by WhatsApp from the job card.</p>
                </div>
                <Switch id="feedback_auto_email" name="feedback_auto_email" checked={autoFeedback} onCheckedChange={setAutoFeedback} />
              </div>
              <Field label="Google review link" htmlFor="google_review_url" error={err('google_review_url')} optional
                hint="In Google Business Profile choose “Ask for reviews” and copy the link. Every customer sees it after scoring, as Google requires.">
                <Input id="google_review_url" name="google_review_url" defaultValue={g.google_review_url ?? ''} placeholder="https://g.page/r/…/review" />
              </Field>
            </div>
          )}
          {!feedback && <input type="hidden" name="google_review_url" value={g.google_review_url ?? ''} />}
          {!feedback && autoFeedback && <input type="hidden" name="feedback_auto_email" value="on" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Paperwork</CardTitle>
          <CardDescription>Wording and numbering on job sheets, estimates and credit notes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Customer authorisation" htmlFor="authorisation_text" error={err('authorisation_text')}
            hint="What the customer signs at check-in, on the job card and printed job sheet. Leave empty for the standard wording.">
            <Textarea id="authorisation_text" name="authorisation_text" rows={3} defaultValue={g.authorisation_text ?? ''} placeholder={DEFAULT_AUTHORISATION} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Credit note prefix" htmlFor="credit_prefix" error={err('credit_prefix')} hint="e.g. CN- gives CN-00001">
              <Input id="credit_prefix" name="credit_prefix" defaultValue={g.credit_prefix ?? 'CN-'} />
            </Field>
            <Field label="Estimate prefix" htmlFor="estimate_prefix" error={err('estimate_prefix')} hint="e.g. EST- gives EST-00001">
              <Input id="estimate_prefix" name="estimate_prefix" defaultValue={g.estimate_prefix ?? 'EST-'} />
            </Field>
            <Field label="Estimates are valid for" htmlFor="estimate_valid_days" error={err('estimate_valid_days')}>
              <div className="relative">
                <Input id="estimate_valid_days" name="estimate_valid_days" type="number" min={1} max={365} defaultValue={g.estimate_valid_days ?? 30} className="pr-14" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days</span>
              </div>
            </Field>
            <Field label="Chase unanswered estimates after" htmlFor="estimate_chase_days" error={err('estimate_chase_days')}
              hint="One reminder email. 0 to never chase.">
              <div className="relative">
                <Input id="estimate_chase_days" name="estimate_chase_days" type="number" min={0} max={30} defaultValue={g.estimate_chase_days ?? 3} className="pr-14" />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">days</span>
              </div>
            </Field>
          </div>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save changes</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
