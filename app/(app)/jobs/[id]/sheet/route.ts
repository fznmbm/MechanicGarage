import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { loadLogo } from '@/lib/invoice-pdf';
import { renderJobSheet, type JobSheetData } from '@/lib/job-sheet-pdf';
import { DEFAULT_AUTHORISATION, jobNo } from '@/lib/jobs';

/** Printable A4 job sheet for the workshop. Prices only with ?prices=1 and never for mechanics. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership();
  if (!m) return new Response('Signed out', { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data: job } = await sb.from('jobs')
    .select('job_number, created_at, promised_at, mileage_in, customer_complaint, mechanic_notes, assigned_to, bay:bays(name), vehicle:vehicles(registration, make, model, colour, vin, mot_due, fuel_type), customer:customers(name, phone, email)')
    .eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
  if (!job) return new Response('Not found', { status: 404 });

  const [{ data: g }, { data: lines }, { data: checks }, { data: sigs }, { data: mech }] = await Promise.all([
    sb.from('garages').select('name, address, postcode, phone, email, brand_colour, logo_url, authorisation_text').eq('id', m.garage_id).single(),
    sb.from('job_lines').select('type, description, quantity, unit_price_pence, part_number, done, approval').eq('job_id', id).order('sort_order'),
    sb.from('job_checks').select('item, status, note').eq('job_id', id).order('sort_order'),
    sb.from('job_signatures').select('kind, signer_name, signed_at, statement, path').eq('job_id', id).order('signed_at'),
    job.assigned_to
      ? sb.from('garage_members').select('display_name').eq('garage_id', m.garage_id).eq('user_id', job.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // newest signature of each kind, embedded as an image
  const latest = new Map<string, NonNullable<typeof sigs>[number]>();
  for (const x of sigs ?? []) latest.set(x.kind, x);
  const signatures = await Promise.all([...latest.values()].map(async (x) => {
    const { data: blob } = await sb.storage.from('job-photos').download(x.path);
    const image = blob ? `data:image/png;base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}` : null;
    return { kind: x.kind, signer_name: x.signer_name, signed_at: x.signed_at, statement: x.statement, image };
  }));

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const data: JobSheetData = {
    garage: { name: g?.name ?? '', address: g?.address ?? null, postcode: g?.postcode ?? null, phone: g?.phone ?? null, email: g?.email ?? null,
      brand_colour: g?.brand_colour ?? null, logo: await loadLogo(g?.logo_url ?? null) },
    job: { job_number: job.job_number, created_at: job.created_at, promised_at: job.promised_at, mileage_in: job.mileage_in,
      customer_complaint: job.customer_complaint, mechanic_notes: job.mechanic_notes, mechanic: mech?.display_name ?? null,
      bay: one(job.bay as { name: string } | { name: string }[] | null)?.name ?? null },
    vehicle: one(job.vehicle as JobSheetData['vehicle'] | NonNullable<JobSheetData['vehicle']>[]),
    customer: one(job.customer as JobSheetData['customer'] | NonNullable<JobSheetData['customer']>[]),
    lines: (lines ?? []) as JobSheetData['lines'],
    checks: (checks ?? []) as JobSheetData['checks'],
    signatures,
    showPrices: m.role !== 'mechanic' && new URL(req.url).searchParams.get('prices') === '1',
    authorisation: g?.authorisation_text?.trim() || DEFAULT_AUTHORISATION,
  };
  const pdf = await renderJobSheet(data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="JobSheet-${jobNo(job.job_number)}${data.vehicle ? `-${data.vehicle.registration}` : ''}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
