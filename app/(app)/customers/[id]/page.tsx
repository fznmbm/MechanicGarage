import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Phone, Mail, Plus, Trash2, Car, BellRing, BellOff } from 'lucide-react';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { FlashToast } from '@/components/flash-toast';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp, initials, miles, ukDate, whatsappLink } from '@/lib/format';
import { STATUS_STYLE, balance, displayStatus } from '@/lib/invoice';
import { ukToday } from '@/lib/time';
import { CustomerForm } from '../customer-form';
import { deleteCustomer } from '../actions';

export const metadata = { title: 'Customer' };

type Vehicle = {
  id: string; registration: string; make: string | null; model: string | null; colour: string | null;
  mot_due: string | null; last_mileage: number | null;
};

export default async function CustomerPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const m = (await getMembership())!;
  const sb = await createClient();

  const [{ data: c }, { data: vehicles }] = await Promise.all([
    sb.from('customers').select('*').eq('id', id).eq('garage_id', m.garage_id).maybeSingle(),
    sb.from('vehicles').select('id, registration, make, model, colour, mot_due, last_mileage')
      .eq('customer_id', id).eq('garage_id', m.garage_id).order('created_at'),
  ]);
  if (!c) notFound();
  const vs = (vehicles ?? []) as Vehicle[];
  const seesMoney = m.role !== 'mechanic';
  const { data: invs } = seesMoney
    ? await sb.from('invoices').select('id, number, issued_at, due_at, total_pence, paid_pence, credited_pence, status')
        .eq('customer_id', id).eq('garage_id', m.garage_id).order('issued_at', { ascending: false }).limit(10)
    : { data: [] as never[] };
  const today = ukToday();
  const owing = (invs ?? []).reduce((s2, x) => s2 + balance(x), 0);
  const wa = whatsappLink(c.phone);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FlashToast message={created ? 'Customer created' : null} />
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(c.name)}
            </span>
            {c.name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            Customer since {ukDate(c.created_at)}
            {c.reminder_consent ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success"><BellRing /> Reminders on</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground"><BellOff /> No reminders</Badge>
            )}
          </span>
        }
        actions={
          <>
            {c.phone && <Button variant="outline" asChild><a href={`tel:${c.phone.replace(/\s/g, '')}`}><Phone /> Call</a></Button>}
            {wa && <Button variant="whatsapp" asChild><a href={wa} target="_blank" rel="noreferrer"><WhatsAppIcon className="size-4" /> WhatsApp</a></Button>}
            {c.email && <Button variant="outline" asChild><a href={`mailto:${c.email}`}><Mail /> Email</a></Button>}
          </>
        }
      >
        <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Customers
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <CustomerForm customer={c} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Vehicles</CardTitle>
              <CardDescription>{vs.length ? `${vs.length} on file` : 'None yet'}</CardDescription>
              <CardAction>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/vehicles/new?customer=${c.id}`}><Plus /> Add</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {vs.length ? (
                <ul className="-mx-2 space-y-1">
                  {vs.map((v) => (
                    <li key={v.id}>
                      <Link href={`/vehicles/${v.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent">
                        <RegPlate reg={v.registration} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {[v.make, v.model].filter(Boolean).join(' ') || 'Unknown vehicle'}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[v.colour, v.last_mileage ? miles(v.last_mileage) : null].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <MotBadge due={v.mot_due} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
                  <Car className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No vehicles linked to this customer.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {seesMoney && (invs?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>{owing > 0 ? <span className="font-medium text-destructive">{gbp(owing)} outstanding</span> : 'Nothing outstanding'}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="-mx-2 space-y-1">
                  {invs!.map((x) => {
                    const ds = displayStatus(x, today);
                    return (
                      <li key={x.id}>
                        <Link href={`/invoices/${x.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
                          <span className="font-mono text-sm">{x.number}</span>
                          <span className="flex-1 text-xs text-muted-foreground">{ukDate(x.issued_at)}</span>
                          <span className="text-sm tabular-nums">{gbp(x.total_pence)}</span>
                          <Badge variant="outline" className={STATUS_STYLE[ds].className}>{STATUS_STYLE[ds].label}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {m.role !== 'mechanic' && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive">Delete customer</CardTitle>
                <CardDescription>
                  Removes the customer record. Their vehicles stay on file without an owner.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form suppressHydrationWarning action={deleteCustomer}>
                  <input suppressHydrationWarning type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    message={`Delete ${c.name}? This cannot be undone.`}>
                    <Trash2 /> Delete customer
                  </ConfirmSubmit>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
