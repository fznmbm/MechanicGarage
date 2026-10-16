import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { prettyReg } from '@/lib/reg';
import { VehicleForm } from '../../vehicle-form';

export const metadata = { title: 'Edit vehicle' };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = (await getMembership())!;
  const sb = await createClient();
  const { data: v } = await sb
    .from('vehicles')
    .select('*, customer:customers(id, name, phone, postcode)')
    .eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
  if (!v) notFound();

  const owner = v.customer
    ? { id: v.customer.id, name: v.customer.name, sub: [v.customer.phone, v.customer.postcode].filter(Boolean).join(' · ') || null }
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`Edit ${prettyReg(v.registration)}`}>
        <Link href={`/vehicles/${v.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Back to vehicle
        </Link>
      </PageHeader>
      <VehicleForm vehicle={v} owner={owner} lookupEnabled={lookupConfigured()} />
    </div>
  );
}
