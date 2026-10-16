import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ChevronLeft, Download, FileText, Mail, Pencil, Wrench, CalendarPlus, Copy, Trash2, ExternalLink, CheckCircle2, XCircle, Eye, PhoneCall,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { FlashToast } from '@/components/flash-toast';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { InvoiceDocument } from '@/components/invoice-document';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate, whatsappLink } from '@/lib/format';
import { ESTIMATE_STATUS, estimateDisplay } from '@/lib/invoice';
import { emailConfigured } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import { ukTime, ukToday } from '@/lib/time';
import { createClient } from '@/lib/supabase/server';
import { jobNo } from '@/lib/jobs';
import { loadEstimate } from '../data';
import { acceptForCustomer, convertToJob, deleteEstimate, duplicateEstimate } from '../actions';
import { EmailEstimateForm, ShareButtons } from './send';

export const metadata = { title: 'Estimate' };

export default async function EstimatePage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { id } = await params;
  const { created, saved } = await searchParams;
  const doc = await loadEstimate(id);
  if (!doc || !doc.estimate) notFound();

  const e = doc.invoice;
  const info = doc.estimate;
  const ds = estimateDisplay(info, ukToday());
  const open = info.status === 'draft' || info.status === 'sent';
  const sb = await createClient();
  const { data: row } = await sb.from('estimates').select('vehicle_id, job_id, job:jobs(job_number)').eq('id', id).single();
  const job = (row?.job as unknown as { job_number: number } | null) ?? null;

  const link = `${await siteOrigin()}/q/${e.public_token}`;
  const first = e.buyer.name?.split(' ')[0] ?? '';
  const wa = whatsappLink(e.buyer.phone);
  const waText = `Hi ${first}, here is your estimate from ${e.seller.name}${e.vehicle.registration ? ` for ${e.vehicle.registration}` : ''}: ${gbp(e.total_pence)}. ` +
    `You can view it and accept online: ${link}`;
  const mailto = `mailto:${e.buyer.email ?? ''}?subject=${encodeURIComponent(`Estimate ${e.number} from ${e.seller.name}`)}` +
    `&body=${encodeURIComponent(`Hi ${first},\n\nHere is your estimate ${e.number}. You can view it and accept online:\n${link}\n\nThanks,\n${e.seller.name}`)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FlashToast message={created ? `Estimate ${e.number} created` : saved ? 'Estimate saved' : null} />
      <PageHeader
        title={<span className="font-mono">{e.number}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={ESTIMATE_STATUS[ds].className}>{ESTIMATE_STATUS[ds].label}</Badge>
            {e.buyer.name && <span>{e.buyer.name}</span>}
            <span>· {ukDate(e.issued_at)}</span>
            <span>· {gbp(e.total_pence)}</span>
            {info.title && <span>· {info.title}</span>}
          </span>
        }
        actions={
          <>
            {open && <Button variant="outline" asChild><Link href={`/estimates/${id}/edit`}><Pencil /> Edit</Link></Button>}
            <Button variant="outline" asChild><a href={`/estimates/${id}/pdf`} target="_blank" rel="noreferrer"><FileText /> PDF</a></Button>
            <Button variant="outline" asChild><a href={`/estimates/${id}/pdf?download`}><Download /> Download</a></Button>
          </>
        }
      >
        <Link href="/estimates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Estimates
        </Link>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 overflow-x-auto rounded-xl border bg-muted/30 p-2 sm:p-4">
          <InvoiceDocument doc={doc} className="rounded-lg" />
        </div>

        <div className="space-y-6">
          {/* customer's answer */}
          {(info.status === 'accepted' || info.status === 'declined' || info.status === 'converted') && (
            <Card className={info.status === 'declined' ? 'border-destructive/30' : 'border-success/40'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {info.status === 'declined' ? <XCircle className="size-5 text-destructive" /> : <CheckCircle2 className="size-5 text-success" />}
                  {info.status === 'declined' ? 'Declined' : 'Accepted'}
                </CardTitle>
                <CardDescription>
                  {info.responded_at && `${ukDate(info.responded_at)} at ${ukTime(info.responded_at)}`}
                  {info.accepted_by && ` · ${info.accepted_by}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {info.response_note && <p className="rounded-lg bg-muted px-3 py-2 text-sm">“{info.response_note}”</p>}
                {row?.job_id ? (
                  <Button className="w-full" asChild><Link href={`/jobs/${row.job_id}`}><Wrench /> Open job {job ? jobNo(job.job_number) : ''}</Link></Button>
                ) : info.status === 'accepted' && (
                  <div className="grid gap-2">
                    <form suppressHydrationWarning action={convertToJob}>
                      <input type="hidden" name="id" value={id} />
                      <Button type="submit" className="w-full"><Wrench /> Create job card</Button>
                    </form>
                    {row?.vehicle_id && <Button variant="outline" asChild><Link href={`/diary/new?vehicle=${row.vehicle_id}`}><CalendarPlus /> Book into the diary</Link></Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {open && (
            <Card>
              <CardHeader>
                <CardTitle>{info.status === 'draft' ? 'Send to customer' : 'Sent'}</CardTitle>
                <CardDescription>
                  {info.status === 'draft' ? 'The customer’s link shows the estimate and lets them accept or decline.'
                    : <>Sent {info.sent_at ? ukDate(info.sent_at) : ''}{info.viewed_at ? <> · <Eye className="inline size-3.5" /> opened {ukDate(info.viewed_at)}</> : ' · not opened yet'}
                      {info.valid_until && ` · valid until ${ukDate(info.valid_until)}`}</>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {emailConfigured()
                  ? <EmailEstimateForm id={id} defaultTo={e.buyer.email ?? ''} />
                  : <Button variant="outline" asChild className="w-full"><a href={mailto}><Mail /> Email from your mail app</a></Button>}
                <div className="flex flex-wrap items-center gap-2">
                  <ShareButtons id={id} link={link} whatsapp={wa ? `${wa}?text=${encodeURIComponent(waText)}` : null} />
                  <Button variant="ghost" size="sm" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink /> Preview</a></Button>
                </div>
                <div className="border-t pt-3">
                  <form suppressHydrationWarning action={acceptForCustomer}>
                    <input type="hidden" name="id" value={id} />
                    <Button type="submit" variant="ghost" size="sm" className="w-full"><PhoneCall /> Customer accepted by phone or in person</Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <form suppressHydrationWarning action={duplicateEstimate}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="outline" size="sm"><Copy /> Duplicate</Button>
            </form>
            {info.status !== 'converted' && (
              <form suppressHydrationWarning action={deleteEstimate}>
                <input type="hidden" name="id" value={id} />
                <ConfirmSubmit variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  message={`Delete estimate ${e.number}? The customer’s link will stop working.`}>
                  <Trash2 /> Delete
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
