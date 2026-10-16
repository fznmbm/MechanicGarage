import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { ukToday } from '@/lib/time';
import type { PickedVehicle } from '@/components/vehicle-picker';
import { diaryOptions } from '../../diary/data';
import { NewJobForm } from './job-form';

export const metadata = { title: 'New job' };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) {
  const m = (await getMembership())!;
  const { vehicle: vid } = await searchParams;
  const { bays, mechanics } = await diaryOptions(m.garage_id);

  let vehicle: PickedVehicle | null = null;
  if (vid) {
    const sb = await createClient();
    const { data } = await sb.from('vehicles').select('id, registration, make, model, customer:customers(id, name, phone)')
      .eq('id', vid).eq('garage_id', m.garage_id).maybeSingle();
    vehicle = (data as unknown as PickedVehicle) ?? null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="New job card">
        <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Job cards
        </Link>
      </PageHeader>
      <NewJobForm vehicle={vehicle} bays={bays} mechanics={mechanics} lookupEnabled={lookupConfigured()} today={ukToday()} />
    </div>
  );
}
