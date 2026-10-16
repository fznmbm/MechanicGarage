import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { lookupConfigured } from '@/lib/vehicle-lookup';
import { EstimateForm } from '../../estimate-form';
import { estimateFormData } from '../../form-data';
import type { EstimateLineInput } from '../../actions';

export const metadata = { title: 'Edit estimate' };

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { id } = await params;
  const sb = await createClient();
  const { data: e } = await sb.from('estimates').select('id, number, status, title, notes, valid_until, vehicle_id').eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
  if (!e) notFound();
  if (!['draft', 'sent'].includes(e.status)) redirect(`/estimates/${id}`);
  const [{ data: lines }, d] = await Promise.all([
    sb.from('estimate_lines').select('type, description, quantity, unit_price_pence, no_vat, optional, part_number').eq('estimate_id', id).order('sort_order'),
    estimateFormData(m.garage_id, e.vehicle_id),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`Edit ${e.number}`} description={e.status === 'sent' ? 'The customer’s link will show the changes straight away.' : undefined}>
        <Link href={`/estimates/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {e.number}
        </Link>
      </PageHeader>
      <EstimateForm {...d} id={id} title={e.title} notes={e.notes} validUntil={e.valid_until ?? d.validUntil}
        lines={(lines ?? []) as EstimateLineInput[]} lookupEnabled={lookupConfigured()} />
    </div>
  );
}
