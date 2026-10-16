import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { EstimateForm } from '../estimate-form';
import { estimateFormData } from '../form-data';

export const metadata = { title: 'New estimate' };

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { vehicle } = await searchParams;
  const d = await estimateFormData(m.garage_id, vehicle);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="New estimate" description="A price for the customer to accept before the work is booked in.">
        <Link href="/estimates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Estimates
        </Link>
      </PageHeader>
      <EstimateForm {...d} lookupEnabled={lookupConfigured()} />
    </div>
  );
}
