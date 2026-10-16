import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { hhmm, isYmd, nowUkMinutes, toMinutes, ukToday } from '@/lib/time';
import type { PickedVehicle } from '@/components/vehicle-picker';
import { BookingForm } from '../booking-form';
import { diaryOptions } from '../data';

export const metadata = { title: 'New booking' };

export default async function NewBookingPage({
  searchParams,
}: { searchParams: Promise<{ date?: string; time?: string; bay?: string; vehicle?: string }> }) {
  const m = (await getMembership())!;
  const sp = await searchParams;
  const { bays, mechanics, opening, closing } = await diaryOptions(m.garage_id);

  const today = ukToday();
  const date = isYmd(sp.date) ? sp.date : today;

  // Default time: requested slot, else next quarter-hour today (within hours), else opening time
  let time = sp.time && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : opening;
  if (!sp.time && date === today) {
    const next = Math.ceil(nowUkMinutes() / 15) * 15;
    if (next > toMinutes(opening) && next < toMinutes(closing)) time = hhmm(next);
  }

  let vehicle: PickedVehicle | null = null;
  if (sp.vehicle) {
    const sb = await createClient();
    const { data } = await sb.from('vehicles')
      .select('id, registration, make, model, customer:customers(id, name, phone)')
      .eq('id', sp.vehicle).eq('garage_id', m.garage_id).maybeSingle();
    vehicle = (data as unknown as PickedVehicle) ?? null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="New booking">
        <Link href={`/diary?date=${date}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Diary
        </Link>
      </PageHeader>
      <BookingForm
        booking={{ date, time, duration: 60, bay_id: bays.some((b) => b.id === sp.bay) ? sp.bay : null }}
        vehicle={vehicle}
        bays={bays}
        mechanics={mechanics}
        lookupEnabled={lookupConfigured()}
      />
    </div>
  );
}
