'use client';

import { useState, useTransition } from 'react';
import { Plus, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CHECK_STYLE, type CheckStatus } from '@/lib/vhc';
import { cn } from '@/lib/utils';
import { checkToLine, setCheck, startHealthCheck } from '../actions';

export type Check = { id: string; category: string; item: string; status: CheckStatus; note: string | null };

const OPTIONS: CheckStatus[] = ['green', 'amber', 'red', 'na'];

export function HealthCheck({ jobId, checks, locked, quoted }: { jobId: string; checks: Check[]; locked: boolean; quoted: string[] }) {
  const [local, setLocal] = useState(checks);
  const [, start] = useTransition();
  const [prev, setPrev] = useState(checks);
  if (checks !== prev) { setPrev(checks); setLocal(checks); } // server refreshed

  if (!checks.length) {
    return (
      <form suppressHydrationWarning action={startHealthCheck} className="flex flex-col items-start gap-3">
        <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />
        <p className="text-sm text-muted-foreground">
          A quick red / amber / green check of tyres, brakes, lights and fluids. Customers see the result when you send work for approval.
        </p>
        <Button type="submit" variant="outline" disabled={locked}><ClipboardCheck /> Start health check</Button>
      </form>
    );
  }

  const update = (c: Check, patch: Partial<Check>) => {
    const next = { ...c, ...patch };
    setLocal((all) => all.map((x) => (x.id === c.id ? next : x)));
    start(() => setCheck({ jobId, checkId: c.id, status: next.status, note: next.note ?? '' }));
  };

  const counts = { red: 0, amber: 0, green: 0 } as Record<string, number>;
  local.forEach((c) => { if (c.status in counts) counts[c.status]++; });
  const categories = [...new Set(local.map((c) => c.category))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 text-sm">
        {(['red', 'amber', 'green'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className={cn('size-2.5 rounded-full', CHECK_STYLE[s].dot)} />{counts[s]} {CHECK_STYLE[s].label.toLowerCase()}</span>
        ))}
        <span className="text-muted-foreground">{local.filter((c) => c.status === 'unchecked').length} still to check</span>
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{cat}</h4>
          <ul className="divide-y rounded-lg border">
            {local.filter((c) => c.category === cat).map((c) => (
              <li key={c.id} className="space-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-40 flex-1 text-sm">{c.item}</span>
                  <div className="flex gap-1">
                    {OPTIONS.map((s) => (
                      <button key={s} type="button" disabled={locked} aria-pressed={c.status === s} title={CHECK_STYLE[s].label}
                        onClick={() => update(c, { status: c.status === s ? 'unchecked' : s })}
                        className={cn('h-8 min-w-12 rounded-md border px-2 text-xs font-medium transition',
                          c.status === s ? CHECK_STYLE[s].on : 'text-muted-foreground hover:bg-accent')}>
                        {CHECK_STYLE[s].short}
                      </button>
                    ))}
                  </div>
                </div>
                {(c.status === 'amber' || c.status === 'red') && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input defaultValue={c.note ?? ''} placeholder="What did you find? e.g. 2mm tread remaining" disabled={locked}
                      className="h-8 flex-1" onBlur={(e) => { if ((e.target.value || '') !== (c.note ?? '')) update(c, { note: e.target.value }); }} />
                    {!locked && (quoted.some((q) => q.startsWith(c.item)) ? (
                      <span className="text-xs text-muted-foreground">Added to work</span>
                    ) : (
                      <form suppressHydrationWarning action={checkToLine}>
                        <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />
                        <input suppressHydrationWarning type="hidden" name="check_id" value={c.id} />
                        <Button type="submit" size="sm" variant="outline" className="h-8"><Plus /> Quote for this</Button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
