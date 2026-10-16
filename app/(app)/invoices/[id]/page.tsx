import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Download, FileText, MessageCircle, Mail, Wrench, Trash2, Info, ExternalLink, FileMinus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { FlashToast } from '@/components/flash-toast';
import { InvoiceDocument } from '@/components/invoice-document';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate, whatsappLink } from '@/lib/format';
import { PAY_METHODS, STATUS_STYLE, balance, displayStatus, fullyCredited, overpaid } from '@/lib/invoice';
import { emailConfigured } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import { ukToday } from '@/lib/time';
import { jobNo } from '@/lib/jobs';
import { loadInvoice } from '../data';
import { deletePayment } from '../actions';
import { CopyLink, CreditNoteForm, EmailForm, PaymentForm, RefundForm, VoidForm } from './invoice-actions';

export const metadata = { title: 'Invoice' };

export default async function InvoicePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { id } = await params;
  const { created } = await searchParams;
  const doc = await loadInvoice(id);
  if (!doc) notFound();

  const i = doc.invoice;
  const today = ukToday();
  const ds = displayStatus(i, today);
  const owed = balance(i);
  const link = `${await siteOrigin()}/i/${i.public_token}`;
  const first = i.buyer.name?.split(' ')[0] ?? '';
  const wa = whatsappLink(i.buyer.phone);
  const waText = `Hi ${first}, here is your invoice ${i.number} from ${i.seller.name}` +
    `${owed > 0 ? ` for ${gbp(owed)}` : ''}: ${link}`;
  const mailto = `mailto:${i.buyer.email ?? ''}?subject=${encodeURIComponent(`Invoice ${i.number} from ${i.seller.name}`)}` +
    `&body=${encodeURIComponent(`Hi ${first},\n\nYou can view and download invoice ${i.number} here:\n${link}\n\nThanks,\n${i.seller.name}`)}`;
  const isVoid = i.status === 'void';
  const credited = i.credited_pence ?? 0;
  const owedBack = overpaid(i);
  const credits = doc.credits ?? [];
  const creditedQty = doc.credited_lines ?? {};
  const canVoid = credits.length === 0 && doc.payments.every((p) => p.deposit);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FlashToast message={created ? `Invoice ${i.number} created` : null} />
      <PageHeader
        title={<span className="font-mono">{i.number}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={STATUS_STYLE[ds].className}>{STATUS_STYLE[ds].label}</Badge>
            {i.buyer.name && <span>{i.buyer.name}</span>}
            <span>· {ukDate(i.issued_at)}</span>
            <span>· {gbp(i.total_pence)}</span>
            {i.emailed_at && <span>· Emailed {ukDate(i.emailed_at)}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild><a href={`/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer"><FileText /> View PDF</a></Button>
            <Button asChild><a href={`/invoices/${i.id}/pdf?download`}><Download /> Download</a></Button>
          </>
        }
      >
        <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Invoices
        </Link>
      </PageHeader>

      {isVoid && (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>
            Voided {i.voided_at ? ukDate(i.voided_at) : ''}{i.void_reason ? `: ${i.void_reason}` : ''}. The number stays on record and can’t be reused.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 overflow-x-auto rounded-xl border bg-muted/30 p-2 sm:p-4">
          <InvoiceDocument doc={doc} className="rounded-lg" />
        </div>

        <div className="space-y-6">
          {!isVoid && (
            <Card>
              <CardHeader>
                <CardTitle>{owedBack > 0 ? `${gbp(owedBack)} to refund` : owed > 0 ? `${gbp(owed)} to pay` : fullyCredited(i) ? 'Credited in full' : 'Paid in full'}</CardTitle>
                <CardDescription>
                  {i.paid_pence !== 0 ? `${gbp(i.paid_pence)} of ${gbp(i.total_pence)} received` : 'No payments yet'}
                  {credited > 0 && ` · ${gbp(credited)} credited`}
                  {owed > 0 && i.due_at && ` · due ${i.due_at === i.issued_at ? 'on receipt' : ukDate(i.due_at)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {doc.payments.length > 0 && (
                  <ul className="divide-y rounded-lg border text-sm">
                    {doc.payments.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1">
                          <div className="font-medium">
                            {p.amount_pence < 0 ? `Refund ${gbp(-p.amount_pence)}` : gbp(p.amount_pence)} · {PAY_METHODS[p.method] ?? p.method}
                            {p.deposit && <Badge variant="secondary" className="ml-2">Deposit</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{ukDate(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''}</div>
                        </div>
                        {m.role === 'owner' && (
                          <form suppressHydrationWarning action={deletePayment}>
                            <input suppressHydrationWarning type="hidden" name="invoice_id" value={i.id} />
                            <input suppressHydrationWarning type="hidden" name="payment_id" value={p.id} />
                            <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Remove payment">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {owed > 0 && <PaymentForm invoiceId={i.id} owed={owed} today={today} />}
                {owedBack > 0 && (m.role === 'owner'
                  ? <RefundForm invoiceId={i.id} amount={owedBack} />
                  : <p className="text-sm text-muted-foreground">The customer has overpaid. Ask the owner to record the refund.</p>)}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Send to customer</CardTitle>
              <CardDescription>The customer’s link shows the invoice and lets them download the PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {emailConfigured() ? (
                <EmailForm invoiceId={i.id} defaultTo={i.buyer.email ?? ''} />
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

          {!isVoid && (credits.length > 0 || m.role === 'owner') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileMinus2 className="size-4" /> Credit notes</CardTitle>
                <CardDescription>To refund or correct an issued invoice. The invoice itself never changes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {credits.length > 0 && (
                  <ul className="divide-y rounded-lg border text-sm">
                    {credits.map((c) => (
                      <li key={c.id}>
                        <Link href={`/invoices/credit/${c.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent">
                          <div className="min-w-0">
                            <div className="font-mono font-medium">{c.number}</div>
                            <div className="truncate text-xs text-muted-foreground">{ukDate(c.issued_at)} · {c.reason}</div>
                          </div>
                          <span className="tabular-nums">−{gbp(c.total_pence)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {m.role === 'owner' && credited < i.total_pence && (
                  <CreditNoteForm invoiceId={i.id} today={today} vat={i.is_vat_invoice} paid={i.paid_pence}
                    left={i.total_pence - credited} nothingCreditedYet={credited === 0}
                    lines={doc.lines.map((l) => ({
                      id: l.id, description: l.description, type: l.type, quantity: Number(l.quantity), unit_price_pence: l.unit_price_pence,
                      left: Math.round((Number(l.quantity) - Number(creditedQty[l.id] ?? 0)) * 100) / 100,
                    }))} />
                )}
              </CardContent>
            </Card>
          )}

          {i.job_id && (
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/jobs/${i.job_id}`}><Wrench /> Open job {i.vehicle.job_number ? jobNo(i.vehicle.job_number) : ''}</Link>
            </Button>
          )}

          {!isVoid && m.role === 'owner' && (canVoid ? <VoidForm invoiceId={i.id} /> : credits.length === 0 && (
            <p className="text-xs text-muted-foreground">To void this invoice, remove its payments first, or issue a credit note instead.</p>
          ))}
        </div>
      </div>
    </div>
  );
}
