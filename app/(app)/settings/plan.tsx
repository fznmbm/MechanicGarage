import { PRODUCT_NAME } from '@/lib/brand';
import { CheckCircle2, AlertTriangle, CreditCard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PLAN_LABEL, type PlanState } from '@/lib/plan';
import { ukDate } from '@/lib/format';
import type { Garage } from '@/lib/types';
import { openBillingPortal, startCheckout } from './billing-actions';

const FEATURES = ['Unlimited staff, bookings, jobs and invoices', 'Online booking page and customer approvals', 'MOT history lookups and reminders', 'Your own branding on everything'];

export function PlanTab({ g, state, stripeOn, flash }: { g: Garage; state: PlanState; stripeOn: boolean; flash?: string }) {
  const good = state.kind === 'ok';
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">Your plan <Badge variant={good ? 'default' : 'outline'}>{PLAN_LABEL[g.plan_status] ?? g.plan_status}</Badge></CardTitle>
        <CardDescription>
          {state.kind === 'trial' && `Your free trial has ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} left${g.trial_ends_at ? ` (ends ${ukDate(g.trial_ends_at)})` : ''}.`}
          {state.kind === 'trial_ended' && 'Your free trial has ended.'}
          {state.kind === 'past_due' && 'Your last payment didn’t go through.'}
          {state.kind === 'cancelled' && 'Your subscription has been cancelled.'}
          {good && (g.plan_status === 'comped' ? 'This garage is on a free plan.' : `One flat monthly fee, everything included${g.plan_renews_at ? `. Renews ${ukDate(g.plan_renews_at)}` : ''}.`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {flash === 'success' && <Alert><CheckCircle2 /><AlertDescription>Thanks! Your subscription is being set up. This page updates within a minute.</AlertDescription></Alert>}
        {flash === 'error' && <Alert variant="destructive"><AlertTriangle /><AlertDescription>We couldn’t reach the payment page. Please try again.</AlertDescription></Alert>}
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {FEATURES.map((f) => <li key={f} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}
        </ul>
        {!stripeOn ? (
          <Alert><Info /><AlertDescription>Online billing isn’t switched on yet. Your plan is managed by {PRODUCT_NAME} support.</AlertDescription></Alert>
        ) : g.plan_status === 'comped' ? null : g.stripe_customer_id && g.plan_status !== 'cancelled' ? (
          <form suppressHydrationWarning action={openBillingPortal}><Button type="submit" variant="outline"><CreditCard /> Manage billing, card and invoices</Button></form>
        ) : (
          <form suppressHydrationWarning action={startCheckout}><Button type="submit" size="lg"><CreditCard /> {g.plan_status === 'cancelled' ? 'Subscribe again' : 'Subscribe now'}</Button></form>
        )}
      </CardContent>
    </Card>
  );
}
