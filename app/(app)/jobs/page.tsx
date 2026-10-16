import Link from 'next/link';
import { Plus, Wrench, Timer, CalendarClock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { JOB_STATUS } from '@/lib/status';
import { JOB_BADGE, JOB_FLOW, jobNo } from '@/lib/jobs';
import { gbp, ukDate } from '@/lib/format';
import { totals } from '@/lib/money';
import { isPast, ukDateOf, ukTime, ukToday } from '@/lib/time';
import { cn } from '@/lib/utils';
import { staffNames, type BoardJob } from './data';

export const metadata = { title: 'Job cards' };

const BOARD = JOB_FLOW.filter((s) => s !== 'collected');

export default async function JobsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; mine?: string; view?: string }> }) {
  const m = (await getMembership())!;
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const mine = sp.mine === '1' || (sp.mine === undefined && m.role === 'mechanic');
  const showCollected = sp.view === 'collected';
  const seesMoney = m.role !== 'mechanic';

  let q = sb.from('jobs')
    .select('id, job_number, status, customer_complaint, promised_at, assigned_to, created_at, completed_at, collected_at, vehicle:vehicles(registration, make, model), customer:customers(name), lines:job_lines(quantity, unit_price_pence)')
    .eq('garage_id', m.garage_id);
  q = showCollected
    ? q.eq('status', 'collected').order('collected_at', { ascending: false }).limit(50)
    : q.neq('status', 'collected').order('job_number');
  if (mine && user) q = q.eq('assigned_to', user.id);

  const [{ data }, names, { data: open }] = await Promise.all([
    q,
    staffNames(m.garage_id),
    sb.from('time_entries').select('job_id, user_id').eq('garage_id', m.garage_id).is('ended_at', null),
  ]);
  const jobs = (data ?? []) as unknown as BoardJob[];
  const clocked = new Map<string, string[]>();
  for (const e of open ?? []) clocked.set(e.job_id, [...(clocked.get(e.job_id) ?? []), names.get(e.user_id) ?? 'Someone']);

  const today = ukToday();
  const highlight = sp.status && (BOARD as readonly string[]).includes(sp.status) ? sp.status : null;

  const tabs = [
    { label: 'Workshop', href: `/jobs${mine ? '?mine=1' : '?mine=0'}`, active: !showCollected },
    { label: 'Collected', href: `/jobs?view=collected${mine ? '&mine=1' : '&mine=0'}`, active: showCollected },
  ];

  const card = (j: BoardJob) => {
    const late = !!j.promised_at && !['complete', 'collected'].includes(j.status) && isPast(j.promised_at);
    const who = clocked.get(j.id);
    return (
      <Link key={j.id} href={`/jobs/${j.id}`}
        className="block space-y-2 rounded-lg border bg-card p-3 text-sm shadow-xs transition hover:border-primary/40 hover:shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{jobNo(j.job_number)}</span>
          {j.vehicle && <RegPlate reg={j.vehicle.registration} />}
        </div>
        <div>
          <div className="truncate font-medium">{[j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle'}</div>
          <div className="truncate text-xs text-muted-foreground">{j.customer?.name ?? 'No customer'}</div>
        </div>
        {j.customer_complaint && <p className="line-clamp-2 text-xs text-muted-foreground">{j.customer_complaint}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {j.assigned_to && <span className="flex items-center gap-1"><User className="size-3" />{names.get(j.assigned_to) ?? '—'}</span>}
          {j.promised_at && j.status !== 'collected' && (
            <span className={cn('flex items-center gap-1', late && 'font-medium text-destructive')}>
              <CalendarClock className="size-3" />
              {ukDateOf(j.promised_at) === today ? ukTime(j.promised_at) : ukDate(j.promised_at)}
            </span>
          )}
          {seesMoney && j.lines.length > 0 && <span className="ml-auto font-medium text-foreground">{gbp(totals(j.lines, null).net)}</span>}
        </div>
        {who && (
          <div className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
            <Timer className="size-3.5 animate-pulse" /> {who.join(', ')} clocked on
          </div>
        )}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader
        title="Job cards"
        description={showCollected ? 'Recently collected jobs.' : `${jobs.length} job${jobs.length === 1 ? '' : 's'} in the workshop.`}
        actions={<Button asChild><Link href="/jobs/new"><Plus /> New job</Link></Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-muted p-[3px]">
          {tabs.map((t) => (
            <Link key={t.label} href={t.href}
              className={cn('rounded-md px-3 py-1 text-sm font-medium', t.active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
            </Link>
          ))}
        </div>
        <Link href={`/jobs?mine=${mine ? '0' : '1'}${showCollected ? '&view=collected' : ''}`}
          className={cn('rounded-full border px-3 py-1 text-xs font-medium', mine ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
          My jobs only
        </Link>
      </div>

      {showCollected ? (
        jobs.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{jobs.map(card)}</div>
        ) : (
          <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No collected jobs yet.</p>
        )
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wrench className="size-6" /></span>
          <div>
            <p className="font-medium">{mine ? 'No jobs assigned to you' : 'The workshop is clear'}</p>
            <p className="text-sm text-muted-foreground">Start a job from a booking in the diary, or create one here.</p>
          </div>
          <Button asChild><Link href="/jobs/new"><Plus /> New job</Link></Button>
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[1100px] grid-cols-5 gap-3">
            {BOARD.map((s) => {
              const col = jobs.filter((j) => j.status === s);
              return (
                <section key={s} className={cn('flex flex-col gap-2 rounded-xl bg-muted/50 p-2', highlight === s && 'ring-2 ring-primary')}>
                  <header className="flex items-center justify-between px-1 py-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className={cn('size-2 rounded-full', JOB_STATUS[s].dot)} />
                      {JOB_STATUS[s].label}
                    </span>
                    <Badge variant="outline" className={cn('tabular-nums', JOB_BADGE[s])}>{col.length}</Badge>
                  </header>
                  {col.map(card)}
                  {col.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nothing here</p>}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
