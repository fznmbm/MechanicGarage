import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { RegPlate } from '@/components/reg-plate';
import { hhmm, ukMinutesOf, ukTime } from '@/lib/time';
import { serviceColour } from '@/lib/services';
import { cn } from '@/lib/utils';
import type { DiaryBooking as Booking } from './page';

const HOUR_PX = 72;

const STATUS_DOT: Record<string, string> = {
  booked: 'bg-muted-foreground/50', confirmed: 'bg-primary', arrived: 'bg-success', no_show: 'bg-destructive',
};
const STATUS_LABEL: Record<string, string> = {
  booked: 'Booked', confirmed: 'Confirmed', arrived: 'Arrived', no_show: 'No-show', cancelled: 'Cancelled',
};

/** Side-by-side lanes for overlapping bookings in one column */
function layoutLanes(items: Booking[]) {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const laneEnds: string[] = [];
  const lane = new Map<string, number>();
  for (const b of sorted) {
    let i = laneEnds.findIndex((end) => end <= b.starts_at);
    if (i === -1) { i = laneEnds.length; laneEnds.push(b.ends_at); } else laneEnds[i] = b.ends_at;
    lane.set(b.id, i);
  }
  return { lane, lanes: Math.max(1, laneEnds.length) };
}

export function DiaryGrid({
  date, bookings, bays, mechanics, dayStart, dayEnd, nowMinutes,
}: {
  date: string; bookings: Booking[]; bays: { id: string; name: string }[]; mechanics: { id: string; name: string }[];
  dayStart: number; dayEnd: number; nowMinutes: number | null;
}) {
  const mechName = new Map(mechanics.map((x) => [x.id, x.name]));
  const hours = Array.from({ length: (dayEnd - dayStart) / 60 }, (_, i) => dayStart + i * 60);
  const height = ((dayEnd - dayStart) / 60) * HOUR_PX;
  const y = (mins: number) => ((Math.max(dayStart, Math.min(dayEnd, mins)) - dayStart) / 60) * HOUR_PX;
  const nowY = nowMinutes != null && nowMinutes >= dayStart && nowMinutes <= dayEnd ? y(nowMinutes) : null;

  const unassigned = bookings.filter((b) => !b.bay_id || !bays.some((x) => x.id === b.bay_id));
  const columns = [
    ...bays.map((b) => ({ id: b.id, name: b.name, items: bookings.filter((x) => x.bay_id === b.id) })),
    ...(unassigned.length || bays.length === 0 ? [{ id: '', name: 'Not assigned', items: unassigned }] : []),
  ];

  return (
    <>
      {/* ---------- Desktop / tablet: bay grid ---------- */}
      <Card className="hidden gap-0 overflow-hidden py-0 md:flex">
        <div className="overflow-x-auto">
          <div className="min-w-fit">
            {/* column headers */}
            <div className="sticky top-0 z-10 flex border-b bg-card">
              <div className="w-16 shrink-0" />
              {columns.map((c) => (
                <div key={c.id || 'none'} className="min-w-48 flex-1 border-l px-3 py-2.5 text-sm font-medium">
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{c.items.length || ''}</span>
                </div>
              ))}
            </div>

            <div className="relative flex" style={{ height }}>
              {/* time gutter */}
              <div className="relative w-16 shrink-0">
                {hours.map((h) => (
                  <div key={h} className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                    style={{ top: y(h) }}>
                    {h === dayStart ? '' : hhmm(h)}
                  </div>
                ))}
              </div>

              {/* hour lines */}
              <div className="pointer-events-none absolute inset-y-0 right-0 left-16">
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t" style={{ top: y(h) }}>
                    <div className="absolute inset-x-0 border-t border-dashed border-border/50" style={{ top: HOUR_PX / 2 }} />
                  </div>
                ))}
              </div>

              {/* current time */}
              {nowY != null && (
                <div className="pointer-events-none absolute right-0 left-16 z-20 border-t-2 border-destructive" style={{ top: nowY }}>
                  <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-destructive" />
                </div>
              )}

              {columns.map((c) => {
                const { lane, lanes } = layoutLanes(c.items);
                return (
                  <div key={c.id || 'none'} className="relative min-w-48 flex-1 border-l">
                    {/* empty half-hour slots: click to book */}
                    {Array.from({ length: (dayEnd - dayStart) / 30 }, (_, i) => dayStart + i * 30).map((s) => (
                      <Link key={s} href={`/diary/new?date=${date}&time=${hhmm(s)}${c.id ? `&bay=${c.id}` : ''}`}
                        aria-label={`Book ${c.name} at ${hhmm(s)}`}
                        className="group absolute inset-x-0 flex items-center justify-center hover:bg-primary/5"
                        style={{ top: y(s), height: HOUR_PX / 2 }}>
                        <Plus className="size-4 text-primary opacity-0 group-hover:opacity-60" />
                      </Link>
                    ))}

                    {c.items.map((b) => {
                      const top = y(ukMinutesOf(b.starts_at));
                      const endMin = ukMinutesOf(b.ends_at) || 24 * 60;
                      const h = Math.max(30, y(endMin < ukMinutesOf(b.starts_at) ? dayEnd : endMin) - top - 2);
                      const w = 100 / lanes;
                      const sc = serviceColour(b.service_type);
                      return (
                        <Link key={b.id} href={`/diary/${b.id}`}
                          className={cn(
                            'absolute z-10 isolate overflow-hidden rounded-md border border-l-4 bg-card px-2 py-1.5 text-xs shadow-sm transition hover:z-20 hover:shadow-md',
                            sc.border,
                            b.status === 'no_show' && 'opacity-60'
                          )}
                          style={{ top: top + 1, height: h, left: `calc(${(lane.get(b.id) ?? 0) * w}% + 3px)`, width: `calc(${w}% - 6px)` }}>
                          <span className={cn('absolute inset-0 -z-10', sc.tint)} />
                          <div className="flex items-center gap-1.5">
                            <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[b.status])} title={STATUS_LABEL[b.status]} />
                            <span className="font-medium tabular-nums">{ukTime(b.starts_at)}</span>
                            {b.vehicle && <RegPlate reg={b.vehicle.registration} className="px-1 py-0 text-[10px]" />}
                          </div>
                          <div className={cn('mt-0.5 truncate font-medium', b.status === 'no_show' && 'line-through')}>{b.service_type}</div>
                          {h >= 60 && (
                            <div className="truncate text-muted-foreground">
                              {[b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ')}
                            </div>
                          )}
                          {h >= 84 && (
                            <div className="truncate text-muted-foreground">
                              {[b.customer?.name, b.mechanic_id ? mechName.get(b.mechanic_id) : null].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* ---------- Phone: agenda list ---------- */}
      <div className="space-y-2 md:hidden">
        {bookings.length ? bookings.map((b) => (
          <Link key={b.id} href={`/diary/${b.id}`}
            className={cn('flex items-center gap-3 rounded-lg border border-l-4 bg-card p-3', serviceColour(b.service_type).border, b.status === 'no_show' && 'opacity-60')}>
            <div className="w-12 text-sm font-semibold tabular-nums">{ukTime(b.starts_at)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {b.vehicle && <RegPlate reg={b.vehicle.registration} />}
                <span className="truncate text-sm font-medium">{b.service_type}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {[b.customer?.name, bays.find((x) => x.id === b.bay_id)?.name].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{STATUS_LABEL[b.status]}</span>
          </Link>
        )) : null}
      </div>

    </>
  );
}
