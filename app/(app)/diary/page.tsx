import Link from 'next/link';
import { Plus, CalendarDays, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { addDays, isYmd, nowUkMinutes, toMinutes, ukDayBounds, ukLongDate, ukMinutesOf, ukToday } from '@/lib/time';
import { diaryOptions } from './data';
import { DateNav } from './date-nav';
import { DiaryGrid } from './diary-grid';

export const metadata = { title: 'Diary' };

export type DiaryBooking = {
  id: string; starts_at: string; ends_at: string; service_type: string; status: string; bay_id: string | null;
  mechanic_id: string | null; notes: string | null;
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  customer: { name: string } | null;
};

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const m = (await getMembership())!;
  const { date: d } = await searchParams;
  const today = ukToday();
  const date = isYmd(d) ? d : today;
  const { start, end } = ukDayBounds(date);

  const sb = await createClient();
  const [{ bays, mechanics, opening, closing }, { data }] = await Promise.all([
    diaryOptions(m.garage_id),
    sb.from('bookings')
      .select('id, starts_at, ends_at, service_type, status, bay_id, mechanic_id, notes, vehicle:vehicles(registration, make, model), customer:customers(name)')
      .eq('garage_id', m.garage_id).neq('status', 'cancelled')
      .lt('starts_at', end).gt('ends_at', start)
      .order('starts_at'),
  ]);
  const bookings = (data ?? []) as unknown as DiaryBooking[];

  // Grid range: opening hours, stretched to fit any bookings outside them
  const mins = bookings.flatMap((b) => [ukMinutesOf(b.starts_at), ukMinutesOf(b.ends_at) || 24 * 60]);
  const dayStart = Math.floor(Math.min(toMinutes(opening), ...mins) / 60) * 60;
  const dayEnd = Math.min(24 * 60, Math.ceil(Math.max(toMinutes(closing), ...mins) / 60) * 60);
  const nowMin = date === today ? nowUkMinutes() : null;
  const arrived = bookings.filter((b) => b.status === 'arrived').length;
  const mots = bookings.filter((b) => /mot/i.test(b.service_type)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Diary"
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">{ukLongDate(date)}</span>
            <span>{bookings.length} booking{bookings.length === 1 ? '' : 's'}</span>
            {mots > 0 && <span>{mots} MOT{mots === 1 ? '' : 's'}</span>}
            {arrived > 0 && <span>{arrived} arrived</span>}
          </span>
        }
        actions={
          <>
            <DateNav date={date} prev={addDays(date, -1)} next={addDays(date, 1)} today={today} />
            <Button asChild><Link href={`/diary/new?date=${date}`}><Plus /> New booking</Link></Button>
          </>
        }
      />

      <DiaryGrid date={date} bookings={bookings} bays={bays} mechanics={mechanics} dayStart={dayStart} dayEnd={dayEnd} nowMinutes={nowMin} />

      {bookings.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <CalendarDays className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Nothing booked for this day</p>
            <p className="text-sm text-muted-foreground">
              <span className="hidden md:inline">Click an empty slot in the diary, or use </span>
              <span className="md:hidden">Use </span>New booking to add one.
            </p>
          </div>
          <Button variant="outline" asChild className="md:hidden"><Link href={`/diary/new?date=${date}`}><Plus /> New booking</Link></Button>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" /> Opening hours {opening}–{closing}. Change them in Settings → Workshop.
      </p>
    </div>
  );
}
