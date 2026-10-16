import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { ukToday } from '@/lib/time';
import { cn } from '@/lib/utils';
import { BoardControls } from './auto-refresh';
import { JobTile, type BoardJob } from './tile';

export const metadata = { title: 'Workshop board' };


const ORDER = ['in_progress', 'checked_in', 'awaiting_parts', 'awaiting_approval', 'complete'];

export default async function WorkshopPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const m = (await getMembership())!;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { who } = await searchParams;
  const mine = who === 'me' || (who === undefined && m.role === 'mechanic');

  let q = sb.from('jobs')
    .select('id, job_number, status, promised_at, assigned_to, customer_complaint, vehicle:vehicles(registration, make, model), bay:bays(name), lines:job_lines(done, approval)')
    .eq('garage_id', m.garage_id).in('status', ORDER).order('promised_at', { ascending: true, nullsFirst: false }).limit(60);
  if (mine && user) q = q.eq('assigned_to', user.id);
  const [{ data: jobs }, { data: open }, { data: members }] = await Promise.all([
    q,
    sb.from('time_entries').select('job_id, user_id').eq('garage_id', m.garage_id).is('ended_at', null),
    sb.from('garage_members').select('user_id, display_name').eq('garage_id', m.garage_id),
  ]);
  const names = new Map((members ?? []).map((x) => [x.user_id as string, x.display_name as string]));
  const clocked = new Map<string, string[]>();
  for (const t of open ?? []) clocked.set(t.job_id, [...(clocked.get(t.job_id) ?? []), t.user_id]);
  const list = ((jobs ?? []) as unknown as BoardJob[]).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const now = new Date().toISOString();
  const today = ukToday();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader title="Workshop board" description={`${list.length} job${list.length === 1 ? '' : 's'} in the workshop · updates every 30 seconds`}
        actions={<BoardControls />}>
        <div className="flex gap-1.5 pb-1">
          {[{ k: 'me', label: 'My jobs' }, { k: 'all', label: 'Everyone' }].map((t) => (
            <Link key={t.k} href={`/workshop?who=${t.k}`}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium', (t.k === 'me') === mine ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              {t.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((j) => {
            const on = clocked.get(j.id) ?? [];
            return <JobTile key={j.id} j={j} on={on} meOn={!!user && on.includes(user.id)} names={names} now={now} today={today} />;
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <p className="font-medium">{mine ? 'No jobs assigned to you' : 'The workshop is empty'}</p>
          <p className="text-sm text-muted-foreground">{mine ? <Link href="/workshop?who=all" className="underline">See everyone’s jobs</Link> : 'Jobs appear here when they’re checked in.'}</p>
        </div>
      )}
    </div>
  );
}
