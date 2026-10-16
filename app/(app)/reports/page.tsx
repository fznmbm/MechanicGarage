import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, Wallet, Receipt, Wrench, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate } from '@/lib/format';
import { PAY_METHODS } from '@/lib/invoice';
import { minutesLabel } from '@/lib/jobs';
import { addDays, isYmd, ukToday } from '@/lib/time';
import { cn } from '@/lib/utils';
import { TakingsChart } from './takings-chart';

export const metadata = { title: 'Reports' };

type Report = {
  sales: { invoices: number; net: number; vat: number; gross: number };
  credits?: { count: number; gross: number };
  deposits_held?: number;
  feedback?: { count: number; average: number | null; low: number };
  by_type: Record<string, number>;
  payments: { total: number; by_method: Record<string, number> };
  daily: { day: string; taken: number }[];
  outstanding: number;
  jobs: { opened: number; completed: number };
  mechanics: { name: string; jobs: number; hours_sold: number; minutes_clocked: number }[];
  mot: { bookings: number; with_extra_work: number };
  bookings: { total: number; online: number; no_show: number };
  top_customers: { name: string | null; total: number; invoices: number }[];
};

function rangeFor(key: string, today: string, from?: string, to?: string) {
  const [y, m] = today.split('-').map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  switch (key) {
    case 'last_month': { const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1; return { from: first(py, pm), to: addDays(first(y, m), -1) }; }
    case 'last_30': return { from: addDays(today, -29), to: today };
    case 'this_year': return { from: `${y}-01-01`, to: today };
    case 'custom': if (isYmd(from) && isYmd(to) && from <= to) return { from, to }; // fall through
    default: return { from: first(y, m), to: today };
  }
}

const PRESETS = [['this_month', 'This month'], ['last_month', 'Last month'], ['last_30', 'Last 30 days'], ['this_year', 'This year']];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const sp = await searchParams;
  const today = ukToday();
  const key = sp.range ?? 'this_month';
  const { from, to } = rangeFor(key, today, sp.from, sp.to);

  const sb = await createClient();
  const { data, error } = await sb.rpc('report_summary', { p_garage: m.garage_id, p_from: from, p_to: to });
  const r = data as Report | null;

  // fill missing days so the chart shows the whole period (cap at 92 bars)
  const days: { day: string; taken: number }[] = [];
  if (r) {
    const map = new Map(r.daily.map((d) => [d.day, d.taken]));
    for (let d = from; d <= to && days.length < 92; d = addDays(d, 1)) days.push({ day: d, taken: map.get(d) ?? 0 });
  }
  const types = [['labour', 'Labour'], ['part', 'Parts'], ['fee', 'Fees & MOT']] as const;
  const typeMax = Math.max(1, ...types.map(([k]) => r?.by_type[k] ?? 0));
  const qs = `from=${from}&to=${to}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Reports" description={`${ukDate(from)} to ${ukDate(to)}`} />

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([k, label]) => (
          <Link key={k} href={`/reports?range=${k}`}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', key === k ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
            {label}
          </Link>
        ))}
        <form suppressHydrationWarning className="flex items-center gap-2">
          <input suppressHydrationWarning type="hidden" name="range" value="custom" />
          <Input type="date" name="from" defaultValue={from} aria-label="From" className="h-8 w-36" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" name="to" defaultValue={to} aria-label="To" className="h-8 w-36" />
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
        </form>
      </div>

      {!r ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{error?.message ?? 'Could not load the report.'}</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Money taken', value: gbp(r.payments.total), sub: Object.entries(r.payments.by_method).map(([k, v]) => `${PAY_METHODS[k] ?? k} ${gbp(v)}`).join(' · ') || 'No payments', icon: Wallet },
              { label: 'Invoiced', value: gbp(r.sales.gross), sub: `${r.sales.invoices} invoice${r.sales.invoices === 1 ? '' : 's'}${r.credits?.count ? ` less ${r.credits.count} credit note${r.credits.count === 1 ? '' : 's'} (${gbp(r.credits.gross)})` : ''}${r.sales.vat ? ` · ${gbp(r.sales.vat)} VAT` : ''}`, icon: Receipt },
              { label: 'Jobs completed', value: String(r.jobs.completed), sub: `${r.jobs.opened} opened${r.sales.invoices ? ` · ${gbp(Math.round(r.sales.gross / r.sales.invoices))} average invoice` : ''}`, icon: Wrench },
              { label: 'Owed to you now', value: gbp(r.outstanding), sub: `All unpaid invoices${r.deposits_held ? ` · ${gbp(r.deposits_held)} deposits held` : ''}`, icon: AlertCircle },
            ].map((k) => (
              <Card key={k.label} className="gap-1">
                <CardHeader>
                  <CardDescription className="flex items-center gap-2"><k.icon className="size-4" />{k.label}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{k.value}</CardTitle>
                  <CardDescription className="text-xs">{k.sub}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>Money taken each day</CardTitle><CardDescription>Payments recorded, by the day they were paid.</CardDescription></CardHeader>
            <CardContent>
              {r.payments.total > 0 ? <TakingsChart days={days} /> : <p className="py-8 text-center text-sm text-muted-foreground">No payments in this period.</p>}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Sales by type</CardTitle><CardDescription>From invoices issued, before VAT.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {types.map(([k, label]) => {
                  const v = r.by_type[k] ?? 0;
                  return (
                    <div key={k} className="space-y-1">
                      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-medium tabular-nums">{gbp(v)}</span></div>
                      <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(v / typeMax) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Bookings and MOTs</CardTitle><CardDescription>How the diary performed.</CardDescription></CardHeader>
              <CardContent>
                <dl className="divide-y text-sm">
                  {[
                    ['Bookings', String(r.bookings.total)],
                    ['Booked online', `${r.bookings.online}${r.bookings.total ? ` (${Math.round((r.bookings.online / r.bookings.total) * 100)}%)` : ''}`],
                    ['No-shows', String(r.bookings.no_show)],
                    ['MOT bookings', String(r.mot.bookings)],
                    ['MOTs that led to other work', `${r.mot.with_extra_work}${r.mot.bookings ? ` (${Math.round((r.mot.with_extra_work / r.mot.bookings) * 100)}%)` : ''}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2 first:pt-0 last:pb-0"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Mechanics</CardTitle><CardDescription>Jobs completed, labour hours sold and time clocked.</CardDescription></CardHeader>
              <CardContent>
                {r.mechanics.length ? (
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-muted-foreground"><th className="pb-2 text-left font-medium">Name</th><th className="pb-2 text-right font-medium">Jobs</th><th className="pb-2 text-right font-medium">Hours sold</th><th className="pb-2 text-right font-medium">Clocked</th><th className="pb-2 text-right font-medium">Efficiency</th></tr></thead>
                    <tbody>
                      {r.mechanics.map((x) => {
                        const clocked = Number(x.minutes_clocked);
                        const eff = clocked > 0 ? Math.round((Number(x.hours_sold) * 60 / clocked) * 100) : null;
                        return (
                          <tr key={x.name} className="border-t">
                            <td className="py-2">{x.name}</td>
                            <td className="py-2 text-right tabular-nums">{x.jobs}</td>
                            <td className="py-2 text-right tabular-nums">{Number(x.hours_sold).toFixed(1)}</td>
                            <td className="py-2 text-right tabular-nums">{clocked ? minutesLabel(clocked) : '—'}</td>
                            <td className="py-2 text-right tabular-nums">{eff == null ? '—' : `${eff}%`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <p className="text-sm text-muted-foreground">No completed jobs or clocked time in this period.</p>}
                <p className="mt-3 text-xs text-muted-foreground">Efficiency is hours sold divided by hours clocked. Over 100% means jobs took less time than was charged.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top customers</CardTitle><CardDescription>By invoiced value.</CardDescription></CardHeader>
              <CardContent>
                {r.top_customers.length ? (
                  <ol className="divide-y text-sm">
                    {r.top_customers.map((c, i) => (
                      <li key={i} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                        <span className="flex-1 truncate">{c.name ?? 'No name'}</span>
                        <span className="text-xs text-muted-foreground">{c.invoices} invoice{c.invoices === 1 ? '' : 's'}</span>
                        <span className="font-medium tabular-nums">{gbp(c.total)}</span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-muted-foreground">No invoices in this period.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Export for your accountant</CardTitle><CardDescription>CSV files for this period. They open in Excel and import into accounting software.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><a href={`/reports/export?type=xero&${qs}`}><Download /> Xero sales invoices</a></Button>
              <Button variant="outline" asChild><a href={`/reports/export?type=invoices&${qs}`}><Download /> Invoice list</a></Button>
              <Button variant="outline" asChild><a href={`/reports/export?type=payments&${qs}`}><Download /> Payments</a></Button>
              <Button variant="outline" asChild><a href={`/reports/export?type=credits&${qs}`}><Download /> Credit notes</a></Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
