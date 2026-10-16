import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { VehicleForm } from '../vehicle-form';

export const metadata = { title: 'Add vehicle' };

export default async function NewVehiclePage({
  searchParams,
}: { searchParams: Promise<{ customer?: string; reg?: string }> }) {
  const { customer, reg } = await searchParams;
  const m = (await getMembership())!;

  let owner: { id: string; name: string; sub: string | null } | null = null;
  if (customer) {
    const sb = await createClient();
    const { data } = await sb.from('customers').select('id, name, phone, postcode')
      .eq('id', customer).eq('garage_id', m.garage_id).maybeSingle();
    if (data) owner = { id: data.id, name: data.name, sub: [data.phone, data.postcode].filter(Boolean).join(' · ') || null };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Add vehicle" description={owner ? `For ${owner.name}` : undefined}>
        <Link href={owner ? `/customers/${owner.id}` : '/vehicles'}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {owner ? owner.name : 'Vehicles'}
        </Link>
      </PageHeader>
      <VehicleForm owner={owner} initialReg={reg} lookupEnabled={lookupConfigured()} />
    </div>
  );
}
