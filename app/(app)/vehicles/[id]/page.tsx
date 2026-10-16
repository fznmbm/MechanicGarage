import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Pencil, Trash2, ShieldAlert, Lightbulb, User, Phone, History, Plus, CalendarPlus, Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { FlashToast } from '@/components/flash-toast';
import { DefectList, MotHistory } from '@/components/mot-history';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp, initials, miles, ukDate } from '@/lib/format';
import { totals } from '@/lib/money';
import { JOB_BADGE, jobNo } from '@/lib/jobs';
import { JOB_STATUS } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { lookupConfigured, type MotTest } from '@/lib/vehicle-lookup';
import { deleteVehicle } from '../actions';
import { RefreshButton } from './refresh-button';

export const metadata = { title: 'Vehicle' };

export default async function VehiclePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string }> }) {
  const { id } = await params;
  const { created, saved } = await searchParams;
  const m = (await getMembership())!;
  const sb = await createClient();

  const { data: v } = await sb
    .from('vehicles')
    .select('*, customer:customers(id, name, phone, email, postcode)')
    .eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
  if (!v) notFound();

  const { data: jobs } = await sb.from('jobs')
    .select('id, job_number, status, created_at, customer_complaint, lines:job_lines(quantity, unit_price_pence)')
    .eq('vehicle_id', v.id).eq('garage_id', m.garage_id).order('created_at', { ascending: false }).limit(20);
  const seesMoney = m.role !== 'mechanic';

  const tests = (v.mot_history ?? []) as MotTest[];
  const latest = tests[0];
  const advisories = latest?.defects.filter((d) => d.type === 'ADVISORY' || d.type === 'MINOR') ?? [];
  const canLookup = lookupConfigured();

  const details: [string, React.ReactNode][] = [
    ['Make', v.make], ['Model', v.model], ['Colour', v.colour], ['Fuel', v.fuel_type],
    ['Engine', v.engine_size ? `${v.engine_size.toLocaleString('en-GB')} cc` : null],
    ['Year', v.year_of_manufacture], ['First registered', v.first_registered ? ukDate(v.first_registered) : null],
    ['Mileage', v.last_mileage != null ? miles(v.last_mileage) : null],
    ['Service due', v.service_due ? ukDate(v.service_due) : null],
    ['VIN', v.vin ? <span key="vin" className="font-mono text-xs">{v.vin}</span> : null],
    ...(v.tax_status ? [['Tax', `${v.tax_status}${v.tax_due ? ` · due ${ukDate(v.tax_due)}` : ''}`] as [string, string]] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FlashToast message={created ? 'Vehicle added' : saved ? 'Vehicle saved' : null} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <RegPlate reg={v.registration} className="px-2.5 py-1 text-lg" />
            <span>{[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <MotBadge due={v.mot_due} />
            {v.mot_checked_at && <span className="text-xs">DVSA checked {ukDate(v.mot_checked_at)}</span>}
          </span>
        }
        actions={
          <>
            <Button asChild><Link href={`/diary/new?vehicle=${v.id}`}><CalendarPlus /> Book in</Link></Button>
            <Button variant="outline" asChild><Link href={`/jobs/new?vehicle=${v.id}`}><Wrench /> New job</Link></Button>
            {canLookup && <RefreshButton id={v.id} />}
            <Button variant="outline" asChild><Link href={`/vehicles/${v.id}/edit`}><Pencil /> Edit</Link></Button>
          </>
        }
      >
        <Link href="/vehicles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Vehicles
        </Link>
      </PageHeader>

      {v.has_outstanding_recall && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Outstanding safety recall</AlertTitle>
          <AlertDescription>
            DVSA records show an unresolved manufacturer recall. Advise the customer to contact a franchised dealer.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {advisories.length > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-warning" /> Work to quote for</CardTitle>
                <CardDescription>
                  {advisories.length} advisory and minor item{advisories.length === 1 ? '' : 's'} from the last MOT on {ukDate(latest.completedDate)}.
                </CardDescription>
              </CardHeader>
              <CardContent><DefectList defects={advisories} /></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="size-4" /> Service history</CardTitle>
              <CardDescription>{jobs?.length ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} at this garage` : 'No jobs yet'}</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs?.length ? (
                <ul className="-mx-2 divide-y">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent">
                        <span className="w-14 font-mono text-xs text-muted-foreground">{jobNo(j.job_number)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{j.customer_complaint?.split('\n')[0] || 'Job'}</div>
                          <div className="text-xs text-muted-foreground">{ukDate(j.created_at)}</div>
                        </div>
                        <Badge variant="outline" className={JOB_BADGE[j.status]}>{JOB_STATUS[j.status as keyof typeof JOB_STATUS]?.label}</Badge>
                        {seesMoney && <span className="w-20 text-right text-sm tabular-nums">{gbp(totals(j.lines, null).net)}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Jobs for this vehicle will be listed here.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="size-4" /> MOT history</CardTitle>
              <CardDescription>
                {tests.length ? `${tests.length} test${tests.length === 1 ? '' : 's'} on DVSA record` : 'No MOT tests saved'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tests.length ? (
                <MotHistory tests={tests} />
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  {canLookup
                    ? 'Use “Refresh from DVSA” to load the MOT history. Vehicles under 3 years old won’t have any yet.'
                    : 'MOT history appears here once the DVSA API key is added.'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Owner</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" asChild><Link href={`/vehicles/${v.id}/edit`}>Change</Link></Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {v.customer ? (
                <Link href={`/customers/${v.customer.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {initials(v.customer.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{v.customer.name}</div>
                    {v.customer.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" />{v.customer.phone}</div>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><User className="size-4" /> No owner linked</p>
                  <Button size="sm" variant="outline" asChild><Link href={`/vehicles/${v.id}/edit`}><Plus /> Link a customer</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                {details.map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{val || '—'}</dd>
                  </div>
                ))}
              </dl>
              {v.notes && <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-line">{v.notes}</p>}
            </CardContent>
          </Card>

          {m.role !== 'mechanic' && (
            <form suppressHydrationWarning action={deleteVehicle}>
              <input suppressHydrationWarning type="hidden" name="id" value={v.id} />
              <ConfirmSubmit variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                message={`Delete ${v.registration}? Its jobs and invoices will lose the link to this vehicle.`}>
                <Trash2 /> Delete vehicle
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
