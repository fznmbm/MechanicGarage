import { notFound } from 'next/navigation';
import { privateMeta } from '@/lib/og';
import { Download, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceDocument } from '@/components/invoice-document';
import { gbp } from '@/lib/format';
import { loadPublicCredit } from '@/app/(app)/invoices/data';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const doc = await loadPublicCredit((await params).token);
  return privateMeta(doc ? `Credit note ${doc.invoice.number} · ${doc.invoice.seller.name}` : 'Credit note', 'Your credit note');
}

export default async function PublicCreditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await loadPublicCredit(token);
  if (!doc) notFound();
  const c = doc.invoice;
  const s = c.seller;
  return (
    <div className="min-h-svh bg-slate-100 px-3 py-6 sm:py-10" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[210mm] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <div className="text-sm text-slate-500">{s.name}</div>
            <div className="text-lg font-semibold text-slate-900">
              Credit of {gbp(c.total_pence)}{doc.against && <span className="text-sm font-normal text-slate-500"> against invoice {doc.against.number}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="bg-white text-slate-900">
              <a href={`/c/${token}/pdf?download`}><Download /> Download PDF</a>
            </Button>
            {s.phone && <Button variant="outline" asChild className="bg-white text-slate-900"><a href={`tel:${s.phone.replace(/\s/g, '')}`}><Phone /> Call</a></Button>}
            {s.email && <Button variant="outline" asChild className="bg-white text-slate-900"><a href={`mailto:${s.email}?subject=Credit note ${c.number}`}><Mail /> Email</a></Button>}
          </div>
        </div>
        <InvoiceDocument doc={doc} className="rounded-xl" />
      </div>
    </div>
  );
}
