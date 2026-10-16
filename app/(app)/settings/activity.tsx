import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { describe, type AuditEntry } from '@/lib/audit';
import { ukDate } from '@/lib/format';
import { ukTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const AREAS = [
  { key: '', label: 'Everything' },
  { key: 'money', label: 'Money', tables: ['invoices', 'payments', 'credit_notes'] },
  { key: 'settings', label: 'Settings and staff', tables: ['garages', 'garage_members', 'invites'] },
  { key: 'records', label: 'Records', tables: ['customers', 'vehicles', 'jobs', 'job_lines', 'bookings', 'estimates'] },
];

/** Owner-only list of who changed what (money, settings, staff and deletions) */
export async function ActivityLog({ garageId, area }: { garageId: string; area: string }) {
  const sb = await createClient();
  const pick = AREAS.find((a) => a.key === area) ?? AREAS[0];
  let q = sb.from('audit_log').select('id, at, actor, table_name, label, action, changes').eq('garage_id', garageId).order('at', { ascending: false }).limit(200);
  if (pick.tables) q = q.in('table_name', pick.tables);
  const { data, error } = await q;
  const rows = (data ?? []) as AuditEntry[];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Activity</CardTitle>
        <CardDescription>Who changed money, settings and staff, and who deleted records. Only owners can see this, and it can’t be edited.</CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {AREAS.map((a) => (
            <Link key={a.key} href={`/settings?tab=activity${a.key ? `&area=${a.key}` : ''}`}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium', pick.key === a.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              {a.label}
            </Link>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {error ? <p className="p-4 text-sm text-muted-foreground">The activity log isn’t set up yet (run SQL file 16).</p>
          : rows.length ? (
          <ul className="divide-y">
            {rows.map((r) => {
              const d = describe(r);
              const flagged = d.details.some((x) => x.sensitive);
              return (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      {flagged && <AlertTriangle className="mr-1 inline size-3.5 text-warning" />}
                      <span className="font-medium">{r.actor ?? 'Someone'}</span> {d.text}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{ukDate(r.at)} {ukTime(r.at)}</span>
                  </div>
                  {d.details.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {d.details.slice(0, 6).map((x, i) => (
                        <li key={i} className={cn(x.sensitive && 'font-medium text-foreground')}>
                          {x.field}: <span className="line-through opacity-70">{x.from}</span> → {x.to}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="p-4 text-sm text-muted-foreground">Nothing recorded yet.</p>}
      </CardContent>
    </Card>
  );
}
