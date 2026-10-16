import Link from 'next/link';
import { CalendarDays, Wrench, Receipt, ShieldCheck, Plus, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { ukDatePlus, ukDayRange, ukHour, ukTime, ukToday } from '@/lib/time';
import { gbp } from '@/lib/format';
import { BOOKING_STATUS, JOB_STATUS, type JobStatus } from '@/lib/status';

export const metadata = { title: 'Dashboard' };

type TodayBooking = {
  id: string;
  starts_at: string;
  service_type: string;
  status: string;
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  customer: { name: string } | null;
};

export default async function Dashboard() {
  const m = (await getMembership())!;
  const sb = await createClient();
  const { start, end } = ukDayRange();
  const today = ukToday();
  const in30 = ukDatePlus(30);
  const seesMoney = m.role !== 'mechanic';

  const [bookingsRes, jobs, unpaid, motDue] = await Promise.all([
    sb.from('bookings')
      .select('id, starts_at, service_type, status, vehicle:vehicles(registration, make, model), customer:customers(name)')
      .eq('garage_id', m.garage_id).neq('status', 'cancelled')
      .gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString())
      .order('starts_at'),
    sb.from('jobs').select('status').eq('garage_id', m.garage_id).neq('status', 'collected'),
    seesMoney
      ? sb.from('invoices').select('total_pence').eq('garage_id', m.garage_id).in('status', ['issued', 'part_paid'])
      : Promise.resolve({ data: [] as { total_pence: number }[] }),
    sb.from('vehicles').select('id', { count: 'exact', head: true })
      .eq('garage_id', m.garage_id).gte('mot_due', today).lte('mot_due', in30),
  ]);

  const bookings = (bookingsRes.data ?? []) as unknown as TodayBooking[];
  const statusCounts = (jobs.data ?? []).reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  const inWorkshop = (jobs.data ?? []).filter((j) => j.status !== 'complete').length;
  const unpaidTotal = (unpaid.data ?? []).reduce((s, i) => s + i.total_pence, 0);

  const hour = ukHour();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());

  const kpis = [
    { label: "Today's bookings", value: String(bookings.length), sub: 'In the diary', icon: CalendarDays, href: '/diary' },
    { label: 'In the workshop', value: String(inWorkshop), sub: `${statusCounts.complete ?? 0} ready to collect`, icon: Wrench, href: '/jobs' },
    ...(seesMoney
      ? [{ label: 'Unpaid invoices', value: gbp(unpaidTotal), sub: `${unpaid.data?.length ?? 0} invoices`, icon: Receipt, href: '/invoices' }]
      : []),
    { label: 'MOTs due', value: String(motDue.count ?? 0), sub: 'Next 30 days', icon: ShieldCheck, href: '/vehicles?mot=30' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {m.display_name.split(' ')[0]}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/diary/new"><CalendarPlus /> New booking</Link></Button>
          <Button asChild><Link href="/jobs/new"><Plus /> New job</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="group">
            <Card className="gap-2 transition-colors group-hover:border-primary/40">
              <CardHeader>
                <CardDescription>{k.label}</CardDescription>
                <CardAction>
                  <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <k.icon className="size-4" />
                  </span>
                </CardAction>
                <CardTitle className="text-3xl font-semibold tabular-nums">{k.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{k.sub}</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today&apos;s diary</CardTitle>
            <CardDescription>Vehicles booked in today</CardDescription>
            <CardAction><Button variant="ghost" size="sm" asChild><Link href="/diary">View diary</Link></Button></CardAction>
          </CardHeader>
          <CardContent>
            {bookings.length ? (
              <ul className="divide-y">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/diary/${b.id}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-accent">
                    <span className="w-12 text-sm font-medium tabular-nums">{ukTime(b.starts_at)}</span>
                    <RegPlate reg={b.vehicle?.registration} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{b.service_type}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ')}
                        {b.customer?.name ? ` · ${b.customer.name}` : ''}
                      </div>
                    </div>
                    <Badge variant={BOOKING_STATUS[b.status]?.variant ?? 'outline'}>
                      {BOOKING_STATUS[b.status]?.label ?? b.status}
                    </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
                <CalendarDays className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Nothing booked in today</p>
                  <p className="text-xs text-muted-foreground">Bookings you add will appear here.</p>
                </div>
                <Button size="sm" variant="outline" asChild><Link href="/diary/new"><Plus /> Add booking</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workshop status</CardTitle>
            <CardDescription>Live job cards</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {(Object.keys(JOB_STATUS) as JobStatus[])
              .filter((s) => s !== 'collected')
              .map((s) => (
                <Link key={s} href={`/jobs?status=${s}`}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent">
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${JOB_STATUS[s].dot}`} />
                    {JOB_STATUS[s].label}
                  </span>
                  <span className="font-medium tabular-nums">{statusCounts[s] ?? 0}</span>
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
