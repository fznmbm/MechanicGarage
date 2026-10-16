import Link from 'next/link';
import { Play, Square, Clock, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RegPlate } from '@/components/reg-plate';
import { JOB_STATUS } from '@/lib/status';
import { JOB_BADGE, jobNo } from '@/lib/jobs';
import { ukDate } from '@/lib/format';
import { ukDateOf, ukTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { clockOff, clockOn } from '../jobs/actions';

export type BoardJob = {
  id: string; job_number: number; status: string; promised_at: string | null; assigned_to: string | null; customer_complaint: string | null;
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  bay: { name: string } | null;
  lines: { done: boolean; approval: string }[];
};

/** One big tap-friendly card on the workshop board */
export function JobTile({ j, on, meOn, names, now, today }: {
  j: BoardJob; on: string[]; meOn: boolean; names: Map<string, string>; now: string; today: string;
}) {
  const work = j.lines.filter((l) => l.approval !== 'declined' && l.approval !== 'pending');
  const done = work.filter((l) => l.done).length;
  const late = j.promised_at && j.promised_at < now && j.status !== 'complete';
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs', meOn && 'border-success ring-1 ring-success/40')}>
      <Link href={`/jobs/${j.id}`} className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <RegPlate reg={j.vehicle?.registration} className="px-2.5 py-1 text-xl" />
          <span className="font-mono text-xs text-muted-foreground">{jobNo(j.job_number)}</span>
        </div>
        <div className="text-lg font-semibold leading-tight">{[j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(' ') || 'Vehicle'}</div>
        {j.customer_complaint && <p className="line-clamp-2 text-sm text-muted-foreground">{j.customer_complaint}</p>}
      </Link>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className={JOB_BADGE[j.status]}>{JOB_STATUS[j.status as keyof typeof JOB_STATUS]?.label}</Badge>
        {j.bay && <Badge variant="secondary">{j.bay.name}</Badge>}
        {j.promised_at && (
          <span className={cn('flex items-center gap-1', late ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            <Clock className="size-3.5" /> {ukDateOf(j.promised_at) === today ? ukTime(j.promised_at) : `${ukDate(j.promised_at)} ${ukTime(j.promised_at)}`}
          </span>
        )}
        {j.assigned_to && <span className="flex items-center gap-1 text-muted-foreground"><User className="size-3.5" /> {names.get(j.assigned_to)}</span>}
      </div>
      {work.length > 0 && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-success transition-all" style={{ width: `${Math.round((done / work.length) * 100)}%` }} />
          </div>
          <div className="text-xs text-muted-foreground">{done} of {work.length} done</div>
        </div>
      )}
      <div className="mt-auto flex items-center gap-2">
        {on.length > 0 && (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-success">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-success" /> {on.map((u) => names.get(u) ?? 'Staff').join(', ')}
          </span>
        )}
        <form suppressHydrationWarning action={meOn ? clockOff : clockOn} className="ml-auto">
          <input type="hidden" name="job_id" value={j.id} />
          <Button type="submit" size="lg" variant={meOn ? 'default' : 'outline'}
            className={cn('h-11', meOn && 'bg-success text-success-foreground hover:bg-success/90')}>
            {meOn ? <><Square /> Clock off</> : <><Play /> Clock on</>}
          </Button>
        </form>
      </div>
    </div>
  );
}
