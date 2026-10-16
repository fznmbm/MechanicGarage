import { PRODUCT_NAME } from '@/lib/brand';
import { notFound } from 'next/navigation';
import { Download, Phone, Mail, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceDocument } from '@/components/invoice-document';
import { gbp, ukDate } from '@/lib/format';
import { balance, brandOf } from '@/lib/invoice';
import { loadPublicInvoice } from '@/app/(app)/invoices/data';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const doc = await loadPublicInvoice((await params).token);
  return {
    title: doc ? `Invoice ${doc.invoice.number} · ${doc.invoice.seller.name}` : 'Invoice',
    robots: { index: false, follow: false },
  };
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await loadPublicInvoice(token);
  if (!doc) notFound();
  const i = doc.invoice;
  const s = i.seller;
  const owed = balance(i);
  const brand = brandOf(s);

  return (
    <div className="min-h-svh bg-slate-100 px-3 py-6 sm:py-10" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[210mm] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <div className="text-sm text-slate-500">{s.name}</div>
            <div className="text-lg font-semibold text-slate-900">
              {i.status === 'void' ? `Invoice ${i.number} has been cancelled`
                : owed > 0 ? <>Amount due: {gbp(owed)}{i.due_at && i.due_at !== i.issued_at && <span className="text-sm font-normal text-slate-500"> by {ukDate(i.due_at)}</span>}</>
                : 'Paid in full. Thank you!'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {owed > 0 && s.payment_link_url && /^https:\/\//.test(s.payment_link_url) && (
              <Button asChild style={{ background: brand }} className="text-white hover:opacity-90">
                <a href={s.payment_link_url} target="_blank" rel="noreferrer"><CreditCard /> Pay online</a>
              </Button>
            )}
            <Button asChild variant="outline" className="bg-white text-slate-900">
              <a href={`/i/${token}/pdf?download`}><Download /> Download PDF</a>
            </Button>
            {s.phone && <Button variant="outline" asChild className="bg-white text-slate-900"><a href={`tel:${s.phone.replace(/\s/g, '')}`}><Phone /> Call</a></Button>}
            {s.email && <Button variant="outline" asChild className="bg-white text-slate-900"><a href={`mailto:${s.email}?subject=Invoice ${i.number}`}><Mail /> Email</a></Button>}
          </div>
        </div>
        <InvoiceDocument doc={doc} className="rounded-xl" />
        <p className="text-center text-xs text-slate-400">Powered by {PRODUCT_NAME}</p>
      </div>
    </div>
  );
}
