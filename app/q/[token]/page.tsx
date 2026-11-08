import { notFound } from 'next/navigation';
import { privateMeta } from '@/lib/og';
import { Download, Phone, Mail, CheckCircle2, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceDocument } from '@/components/invoice-document';
import { gbp, ukDate } from '@/lib/format';
import { brandOf } from '@/lib/invoice';
import { PRODUCT_NAME } from '@/lib/brand';
import { loadPublicEstimate } from '@/app/(app)/estimates/data';
import { RespondForm } from './respond';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const doc = await loadPublicEstimate((await params).token);
  return privateMeta(doc ? `Estimate ${doc.invoice.number} · ${doc.invoice.seller.name}` : 'Estimate', 'Your estimate',
    'Tap to view the work and prices, and accept online. Only people with this link can see it.');
}

export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await loadPublicEstimate(token);
  if (!doc?.estimate) notFound();
  const e = doc.invoice;
  const s = e.seller;
  const info = doc.estimate;
  const brand = brandOf(s);
  const canAnswer = info.status === 'sent' && !info.expired;
  const accepted = info.status === 'accepted' || info.status === 'converted';

  return (
    <div className="min-h-svh bg-slate-100 px-3 py-6 sm:py-10" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[210mm] space-y-4">
        <div className="grid gap-4 rounded-xl bg-white p-4 text-slate-900 shadow-sm sm:p-6 md:grid-cols-[1fr_20rem]">
          <div className="space-y-2">
            <div className="text-sm text-slate-500">{s.name}</div>
            <h1 className="text-xl font-semibold">{info.title ?? `Estimate ${e.number}`}</h1>
            <p className="text-sm text-slate-600">
              {e.vehicle.registration && <>For {[e.vehicle.make, e.vehicle.model].filter(Boolean).join(' ') || 'your vehicle'} ({e.vehicle.registration}). </>}
              {info.valid_until && !info.expired && <>Valid until {ukDate(info.valid_until)}.</>}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="bg-white text-slate-900"><a href={`/q/${token}/pdf?download`}><Download /> PDF</a></Button>
              {s.phone && <Button variant="outline" size="sm" asChild className="bg-white text-slate-900"><a href={`tel:${s.phone.replace(/\s/g, '')}`}><Phone /> Call us</a></Button>}
              {s.email && <Button variant="outline" size="sm" asChild className="bg-white text-slate-900"><a href={`mailto:${s.email}?subject=Estimate ${e.number}`}><Mail /> Email</a></Button>}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            {canAnswer ? (
              <RespondForm token={token} brand={brand} vatRate={e.is_vat_invoice ? info.vat_rate : 0}
                lines={doc.lines.map((l) => ({ id: l.id, description: l.description, line_total_pence: l.line_total_pence, optional: l.optional, no_vat: Number(l.vat_rate) === 0 }))} />
            ) : accepted ? (
              <div className="space-y-3 text-center">
                <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
                <p className="font-semibold">Accepted{info.accepted_by ? ` by ${info.accepted_by}` : ''}</p>
                <p className="text-sm text-slate-600">Total {gbp(e.total_pence)}. Thank you, we’ll be in touch to book it in.</p>
                {info.book_url && (
                  <a href={`/book?garage=${info.garage_slug}`} className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white" style={{ background: brand }}>
                    <CalendarPlus className="size-4" /> Pick a date online
                  </a>
                )}
              </div>
            ) : info.status === 'declined' ? (
              <p className="text-center text-sm text-slate-600">You declined this estimate. If you change your mind, just give us a call.</p>
            ) : (
              <p className="text-center text-sm text-slate-600">This estimate has expired. Please call us for an up-to-date price.</p>
            )}
          </div>
        </div>
        <InvoiceDocument doc={doc} className="rounded-xl" />
        <p className="text-center text-xs text-slate-400">Powered by {PRODUCT_NAME}</p>
      </div>
    </div>
  );
}
