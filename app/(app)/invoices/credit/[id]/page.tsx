import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Download, FileText, MessageCircle, Mail, Receipt, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { FlashToast } from '@/components/flash-toast';
import { InvoiceDocument } from '@/components/invoice-document';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate, whatsappLink } from '@/lib/format';
import { PAY_METHODS } from '@/lib/invoice';
import { emailConfigured } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import { loadCredit } from '../../data';
import { CopyLink, EmailForm } from '../../[id]/invoice-actions';

export const metadata = { title: 'Credit note' };

export default async function CreditNotePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { id } = await params;
  const { created } = await searchParams;
  const doc = await loadCredit(id);
  if (!doc) notFound();

  const c = doc.invoice;
  const link = `${await siteOrigin()}/c/${c.public_token}`;
  const first = c.buyer.name?.split(' ')[0] ?? '';
  const wa = whatsappLink(c.buyer.phone);
  const waText = `Hi ${first}, here is credit note ${c.number} from ${c.seller.name} for ${gbp(c.total_pence)}: ${link}`;
  const mailto = `mailto:${c.buyer.email ?? ''}?subject=${encodeURIComponent(`Credit note ${c.number} from ${c.seller.name}`)}` +
    `&body=${encodeURIComponent(`Hi ${first},\n\nYou can view and download credit note ${c.number} here:\n${link}\n\nThanks,\n${c.seller.name}`)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FlashToast message={created ? `Credit note ${c.number} issued` : null} />
      <PageHeader
        title={<span className="font-mono">{c.number}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>Credit note</span>
            {c.buyer.name && <span>· {c.buyer.name}</span>}
            <span>· {ukDate(c.issued_at)}</span>
            <span>· −{gbp(c.total_pence)}</span>
            {doc.refund && doc.refund.amount_pence > 0 && (
              <span>· {gbp(doc.refund.amount_pence)} refunded{doc.refund.method ? ` by ${(PAY_METHODS[doc.refund.method] ?? doc.refund.method).toLowerCase()}` : ''}</span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild><a href={`/invoices/credit/${c.id}/pdf`} target="_blank" rel="noreferrer"><FileText /> View PDF</a></Button>
            <Button asChild><a href={`/invoices/credit/${c.id}/pdf?download`}><Download /> Download</a></Button>
          </>
        }
      >
        <Link href="/invoices?tab=credits" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Credit notes
        </Link>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 overflow-x-auto rounded-xl border bg-muted/30 p-2 sm:p-4">
          <InvoiceDocument doc={doc} className="rounded-lg" />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Send to customer</CardTitle>
              <CardDescription>The link shows the credit note and lets them download the PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailConfigured() ? (
                <EmailForm invoiceId={c.id} defaultTo={c.buyer.email ?? ''} credit />
              ) : (
                <Button variant="outline" asChild className="w-full"><a href={mailto}><Mail /> Email from your mail app</a></Button>
              )}
              <div className="flex flex-wrap gap-2">
                {wa && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
                  </Button>
                )}
                <CopyLink url={link} />
                <Button variant="ghost" size="sm" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink /> Preview</a></Button>
              </div>
            </CardContent>
          </Card>
          {doc.against && (
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/invoices/${doc.against.id}`}><Receipt /> Open invoice {doc.against.number}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
