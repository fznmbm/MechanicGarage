import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { hhmm, ukDateOf, ukMinutesOf } from '@/lib/time';
import type { PickedVehicle } from '@/components/vehicle-picker';
import { BookingForm } from '../../booking-form';
import { diaryOptions } from '../../data';

export const metadata = { title: 'Edit booking' };

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = (await getMembership())!;
  const sb = await createClient();
  const [{ data: b }, opts] = await Promise.all([
    sb.from('bookings')
      .select('*, vehicle:vehicles(id, registration, make, model, customer:customers(id, name, phone))')
      .eq('id', id).eq('garage_id', m.garage_id).maybeSingle(),
    diaryOptions(m.garage_id),
  ]);
  if (!b) notFound();

  const duration = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Edit booking">
        <Link href={`/diary/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Back to booking
        </Link>
      </PageHeader>
      <BookingForm
        booking={{
          id: b.id, service_type: b.service_type, date: ukDateOf(b.starts_at), time: hhmm(ukMinutesOf(b.starts_at)),
          duration, bay_id: b.bay_id, mechanic_id: b.mechanic_id, status: b.status, source: b.source, notes: b.notes,
        }}
        vehicle={(b.vehicle as unknown as PickedVehicle) ?? null}
        bays={opts.bays}
        mechanics={opts.mechanics}
        lookupEnabled={lookupConfigured()}
      />
    </div>
  );
}
