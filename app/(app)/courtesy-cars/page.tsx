import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CarFront, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { ukDate } from '@/lib/format';
import { ukTime } from '@/lib/time';
import { jobNo } from '@/lib/jobs';
import { cn } from '@/lib/utils';
import { setCarActive } from './actions';
import { AddCarForm, LendForm, ReturnForm } from './forms';

export const metadata = { title: 'Courtesy cars' };

type Car = { id: string; registration: string; description: string | null; active: boolean };
type Loan = {
  id: string; car_id: string; out_at: string; due_back_at: string | null; returned_at: string | null;
  mileage_out: number | null; mileage_in: number | null; fuel_out: string | null; fuel_in: string | null; licence_checked: boolean; notes: string | null;
  job: { id: string; job_number: number } | null; customer: { id: string; name: string; phone: string | null } | null;
};

export default async function CourtesyCarsPage() {
  const m = (await getMembership())!;
  const sb = await createClient();
  const { data: g } = await sb.from('garages').select('feature_courtesy_cars').eq('id', m.garage_id).maybeSingle();
  if (!g?.feature_courtesy_cars) redirect(m.role === 'owner' ? '/settings?tab=features' : '/');
  const staff = m.role !== 'mechanic';

  const [{ data: cars }, { data: loans }] = await Promise.all([
    sb.from('courtesy_cars').select('id, registration, description, active').eq('garage_id', m.garage_id).order('registration'),
    sb.from('courtesy_loans')
      .select('id, car_id, out_at, due_back_at, returned_at, mileage_out, mileage_in, fuel_out, fuel_in, licence_checked, notes, job:jobs(id, job_number), customer:customers(id, name, phone)')
      .eq('garage_id', m.garage_id).order('out_at', { ascending: false }).limit(60),
  ]);
  const all = (cars ?? []) as Car[];
  const ls = (loans ?? []) as unknown as Loan[];
  const open = ls.filter((l) => !l.returned_at);
  const outIds = new Set(open.map((l) => l.car_id));
  const free = all.filter((c) => c.active && !outIds.has(c.id));
  const car = (id: string) => all.find((c) => c.id === id);
  const now = new Date().toISOString();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Courtesy cars" description={`${free.length} free · ${open.length} out`} />

      <Card>
        <CardHeader><CardTitle>Out now</CardTitle></CardHeader>
        <CardContent>
          {open.length ? (
            <ul className="divide-y">
              {open.map((l) => {
                const late = l.due_back_at && l.due_back_at < now;
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                    <RegPlate reg={car(l.car_id)?.registration} />
                    <div className="min-w-48 flex-1 text-sm">
                      <div className="font-medium">
                        {l.customer ? <Link href={`/customers/${l.customer.id}`} className="hover:underline">{l.customer.name}</Link> : 'No customer'}
                        {l.job && <Link href={`/jobs/${l.job.id}`} className="ml-2 font-mono text-xs text-muted-foreground hover:underline">{jobNo(l.job.job_number)}</Link>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Out {ukDate(l.out_at)} {ukTime(l.out_at)}
                        {l.mileage_out != null && ` · ${l.mileage_out.toLocaleString('en-GB')} mi`}{l.fuel_out && ` · fuel ${l.fuel_out}`}
                        {!l.licence_checked && ' · licence not checked'}
                      </div>
                    </div>
                    {l.due_back_at && (
                      <Badge variant="outline" className={cn(late && 'border-destructive/40 bg-destructive/10 text-destructive')}>
                        {late && <AlertTriangle />} Due {ukDate(l.due_back_at)} {ukTime(l.due_back_at)}
                      </Badge>
                    )}
                    {staff && <ReturnForm loanId={l.id} />}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted-foreground">All cars are in.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cars</CardTitle><CardDescription>Lend a car from a job card, or here for a customer without one.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {all.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {all.map((c) => (
                  <li key={c.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', !c.active && 'opacity-60')}>
                    <RegPlate reg={c.registration} />
                    <span className="min-w-32 flex-1 text-sm">{c.description}</span>
                    <Badge variant={outIds.has(c.id) ? 'secondary' : 'outline'}>{!c.active ? 'Off the road' : outIds.has(c.id) ? 'Out' : 'Free'}</Badge>
                    {staff && !outIds.has(c.id) && (
                      <form suppressHydrationWarning action={setCarActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? '0' : '1'} />
                        <Button type="submit" size="sm" variant="ghost">{c.active ? 'Take off road' : 'Back on road'}</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {staff && <AddCarForm />}
            {!all.length && <p className="text-sm text-muted-foreground"><CarFront className="mr-1 inline size-4" /> Add your loan cars to start.</p>}
          </CardContent>
        </Card>
        {staff && free.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Lend without a job</CardTitle></CardHeader>
            <CardContent><LendForm cars={free} /></CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent loans</CardTitle></CardHeader>
        <CardContent>
          {ls.some((l) => l.returned_at) ? (
            <ul className="divide-y text-sm">
              {ls.filter((l) => l.returned_at).slice(0, 20).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-xs">{car(l.car_id)?.registration}</span>
                  <span className="flex-1">{l.customer?.name ?? '—'}</span>
                  <span className="text-xs text-muted-foreground">
                    {ukDate(l.out_at)} – {ukDate(l.returned_at!)}
                    {l.mileage_out != null && l.mileage_in != null && ` · ${(l.mileage_in - l.mileage_out).toLocaleString('en-GB')} mi`}
                    {l.fuel_out && l.fuel_in && ` · fuel ${l.fuel_out} → ${l.fuel_in}`}
                  </span>
                  {l.notes && <span className="w-full text-xs text-muted-foreground">{l.notes}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No returned loans yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
