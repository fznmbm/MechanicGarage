import Link from 'next/link';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Trash2, Phone, Timer, Square, Play, Lightbulb, Plus, Camera, ClipboardList,
  Wrench, CalendarDays, Check, Receipt, ClipboardCheck, ThumbsUp, ExternalLink, Printer, PenLine, CarFront, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { FlashToast } from '@/components/flash-toast';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { JOB_STATUS } from '@/lib/status';
import { JOB_BADGE, JOB_FLOW, jobNo, minutesLabel } from '@/lib/jobs';
import { gbp, initials, miles, ukDate, whatsappLink } from '@/lib/format';
import { billable, totals, vatRateOn } from '@/lib/money';
import { addDays, hhmm, ukDateOf, ukMinutesOf, ukTime, ukToday } from '@/lib/time';
import { prettyReg } from '@/lib/reg';
import { cn } from '@/lib/utils';
import type { MotTest } from '@/lib/vehicle-lookup';
import { diaryOptions } from '../../diary/data';
import { addAdvisoryLine, clockOff, clockOn, deleteJob, markApprovalSent, markFeedbackSent, setJobStatus } from '../actions';
import { siteOrigin } from '@/lib/url';
import { PAY_METHODS, balance, isOpenInvoice } from '@/lib/invoice';
import { removeDeposit } from '../../invoices/actions';
import { DepositForm } from '../../invoices/[id]/invoice-actions';
import { HealthCheck, type Check as HealthItem } from './health-check';
import { CopyAndMark, SendLink } from './approval-buttons';
import { LinesEditor, type JobLine } from './lines-editor';
import { NotesForm } from './notes-form';
import { DetailsForm } from './details-form';
import { Photos, type JobPhoto } from './photos';
import { IssueInvoiceForm } from './issue-invoice';
import { Signatures, type SignatureRow } from './signatures';
import { LendForm, ReturnForm, type CarOption } from '../../courtesy-cars/forms';
import { DEFAULT_AUTHORISATION } from '@/lib/jobs';

export const metadata = { title: 'Job card' };

type TimeEntry = { id: string; user_id: string; started_at: string; ended_at: string | null };

function StatusForm({ id, status, children, variant = 'outline', className }: {
  id: string; status: string; children: React.ReactNode; variant?: 'outline' | 'default' | 'ghost'; className?: string;
}) {
  return (
    <form suppressHydrationWarning action={setJobStatus}>
      <input suppressHydrationWarning type="hidden" name="id" value={id} />
      <input suppressHydrationWarning type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant} className={className}>{children}</Button>
    </form>
  );
}

const NEXT: Record<string, { status: string; label: string }> = {
  checked_in: { status: 'in_progress', label: 'Start work' },
  in_progress: { status: 'complete', label: 'Mark ready to collect' },
  awaiting_parts: { status: 'in_progress', label: 'Parts arrived: resume' },
  awaiting_approval: { status: 'in_progress', label: 'Approved: resume' },
  complete: { status: 'collected', label: 'Customer collected' },
};

export default async function JobPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const m = (await getMembership())!;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const { data: job } = await sb.from('jobs')
    .select('*, vehicle:vehicles(id, registration, make, model, colour, mot_due, last_mileage, mot_history), customer:customers(id, name, phone, email), booking:bookings(id, starts_at)')
    .eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
  if (!job) notFound();

  const [{ data: lines }, { data: photoRows }, { data: entries }, { data: garage }, opts, { data: members }] = await Promise.all([
    sb.from('job_lines').select('id, type, description, quantity, unit_price_pence, cost_pence, part_number, done, no_vat, approval, part_id').eq('job_id', id).order('sort_order'),
    sb.from('job_photos').select('id, path, caption').eq('job_id', id).order('created_at'),
    sb.from('time_entries').select('id, user_id, started_at, ended_at').eq('job_id', id).order('started_at'),
    sb.from('garages').select('name, phone, labour_rate_pence, vat_registered, vat_effective_from, default_vat_rate, payment_terms_days, authorisation_text, feature_courtesy_cars, feature_feedback').eq('id', m.garage_id).single(),
    diaryOptions(m.garage_id),
    sb.from('garage_members').select('user_id, display_name').eq('garage_id', m.garage_id),
  ]);
  const [{ data: checkRows }, { data: menu }, { data: sigRows }] = await Promise.all([
    sb.from('job_checks').select('id, category, item, status, note').eq('job_id', id).order('sort_order'),
    sb.from('service_menu').select('id, name').eq('garage_id', m.garage_id).eq('active', true).order('sort_order'),
    sb.from('job_signatures').select('id, kind, signer_name, signed_at, statement, path').eq('job_id', id).order('signed_at'),
  ]);
  const sigUrls = sigRows?.length
    ? (await sb.storage.from('job-photos').createSignedUrls(sigRows.map((x) => x.path), 3600)).data ?? []
    : [];
  const signatures: SignatureRow[] = (sigRows ?? []).map((x, i) => ({
    id: x.id, kind: x.kind as SignatureRow['kind'], signer_name: x.signer_name, signed_at: x.signed_at, statement: x.statement, url: sigUrls[i]?.signedUrl ?? null,
  }));

  // optional features
  type Loan = { id: string; out_at: string; due_back_at: string | null; mileage_out: number | null; fuel_out: string | null; car: { registration: string; description: string | null } | null };
  const carsOn = !!garage?.feature_courtesy_cars;
  const [{ data: loanRows }, { data: carRows }, { data: openLoans }, { data: feedback }] = await Promise.all([
    carsOn ? sb.from('courtesy_loans').select('id, out_at, due_back_at, mileage_out, fuel_out, car:courtesy_cars(registration, description)').eq('job_id', id).is('returned_at', null)
      : Promise.resolve({ data: [] }),
    carsOn ? sb.from('courtesy_cars').select('id, registration, description').eq('garage_id', m.garage_id).eq('active', true).order('registration')
      : Promise.resolve({ data: [] }),
    carsOn ? sb.from('courtesy_loans').select('car_id').eq('garage_id', m.garage_id).is('returned_at', null) : Promise.resolve({ data: [] }),
    garage?.feature_feedback && m.role !== 'mechanic'
      ? sb.from('job_feedback').select('token, sent_at, score, comment, responded_at').eq('job_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const loan = ((loanRows ?? []) as unknown as Loan[])[0] ?? null;
  const busy = new Set(((openLoans ?? []) as { car_id: string }[]).map((x) => x.car_id));
  const freeCars = ((carRows ?? []) as CarOption[]).filter((c) => !busy.has(c.id));
  const fb = feedback as { token: string; sent_at: string | null; score: number | null; comment: string | null; responded_at: string | null } | null;

  const names = new Map((members ?? []).map((x) => [x.user_id as string, x.display_name as string]));
  const signed = photoRows?.length
    ? (await sb.storage.from('job-photos').createSignedUrls(photoRows.map((p) => p.path), 3600)).data ?? []
    : [];
  const photos: JobPhoto[] = (photoRows ?? []).map((p, i) => ({ id: p.id, caption: p.caption, url: signed[i]?.signedUrl ?? null }));

  const ls = (lines ?? []) as JobLine[];
  const canPrice = m.role !== 'mechanic';
  const vatRate = garage ? vatRateOn(garage, ukToday()) : null;
  const t = totals(billable(ls), vatRate);

  type InvoiceMini = { id: string; number: string; status: 'draft' | 'issued' | 'part_paid' | 'paid' | 'void'; total_pence: number; paid_pence: number; credited_pence: number; due_at: string | null };
  const [{ data: invoiced }, { data: invoices }, { data: deposits }] = await Promise.all([
    sb.rpc('job_has_invoice', { p_job: id }),
    canPrice
      ? sb.from('invoices').select('id, number, status, total_pence, paid_pence, credited_pence, due_at').eq('job_id', id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as InvoiceMini[] }),
    canPrice
      ? sb.from('payments').select('id, amount_pence, method, paid_at').is('invoice_id', null)
          .or(job.booking_id ? `job_id.eq.${id},booking_id.eq.${job.booking_id}` : `job_id.eq.${id}`).order('paid_at')
      : Promise.resolve({ data: [] as { id: string; amount_pence: number; method: string; paid_at: string }[] }),
  ]);
  const activeInvoice = ((invoices ?? []) as InvoiceMini[]).find((x) => isOpenInvoice(x)) ?? null;
  const pastInvoices = ((invoices ?? []) as InvoiceMini[]).filter((x) => !isOpenInvoice(x));
  const locked = job.status === 'collected' || !!invoiced;

  // time clock
  const te = (entries ?? []) as TimeEntry[];
  const myOpen = te.find((e) => e.user_id === user?.id && !e.ended_at);
  const nowIso = new Date().toISOString();
  const minsOf = (e: TimeEntry) => (new Date(e.ended_at ?? nowIso).getTime() - new Date(e.started_at).getTime()) / 60_000;
  const totalMins = te.reduce((s, e) => s + minsOf(e), 0);
  const soldHours = ls.filter((l) => l.type === 'labour').reduce((s, l) => s + Number(l.quantity), 0);

  // last MOT advisories, not yet added to the job
  const tests = (job.vehicle?.mot_history ?? []) as MotTest[];
  const advisories = (tests[0]?.defects ?? [])
    .filter((d) => d.type === 'ADVISORY' || d.type === 'MINOR')
    .filter((d) => !ls.some((l) => l.description.includes(d.text)));

  const approvalLines = ls.filter((l) => l.approval !== 'not_required');
  const pendingCount = approvalLines.filter((l) => l.approval === 'pending').length;
  const approvalLink = `${await siteOrigin()}/a/${job.approval_token}`;

  const next = NEXT[job.status];
  const wa = whatsappLink(job.customer?.phone);
  const firstName = job.customer?.name?.split(' ')[0] ?? '';
  const approvalMsg = `Hi ${firstName}, ${garage?.name ?? 'the garage'} here. We've checked your ${job.vehicle ? prettyReg(job.vehicle.registration) : 'vehicle'} ` +
    `and found some work we'd recommend. Please take a look and approve or decline: ${approvalLink}`;
  const readyMsg = `Hi ${firstName}, your ${job.vehicle ? prettyReg(job.vehicle.registration) : 'vehicle'} is ready to collect from ${garage?.name ?? 'us'}.` +
    `${canPrice && t.gross > 0 ? ` The total is ${gbp(t.gross)}.` : ''}${garage?.phone ? ` Any questions, call ${garage.phone}.` : ''} Thanks!`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FlashToast message={created ? 'Job card opened' : null} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-muted-foreground">{jobNo(job.job_number)}</span>
            {job.vehicle && <RegPlate reg={job.vehicle.registration} className="px-2.5 py-1 text-lg" />}
            <span>{[job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(' ') || 'Job card'}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={JOB_BADGE[job.status]}>{JOB_STATUS[job.status as keyof typeof JOB_STATUS]?.label}</Badge>
            {job.customer?.name && <span>{job.customer.name}</span>}
            <span>· Opened {ukDate(job.created_at)}</span>
            {job.promised_at && !['complete', 'collected'].includes(job.status) && (
              <span>· Promised {ukDateOf(job.promised_at) === ukToday() ? `today ${ukTime(job.promised_at)}` : `${ukDate(job.promised_at)} ${ukTime(job.promised_at)}`}</span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/jobs/${job.id}/sheet`} target="_blank" rel="noreferrer"><Printer /> Job sheet</a>
            </Button>
            {next && <StatusForm id={job.id} status={next.status} variant="default"><Check /> {next.label}</StatusForm>}
          </>
        }
      >
        <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Job cards
        </Link>
      </PageHeader>

      {/* status stepper */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ol className="flex min-w-max gap-1.5">
          {JOB_FLOW.map((s, i) => {
            const current = job.status === s;
            const passed = JOB_FLOW.indexOf(job.status as (typeof JOB_FLOW)[number]) > i;
            return (
              <li key={s}>
                <form suppressHydrationWarning action={setJobStatus}>
                  <input suppressHydrationWarning type="hidden" name="id" value={job.id} />
                  <input suppressHydrationWarning type="hidden" name="status" value={s} />
                  <button type="submit" disabled={current}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                      current ? 'border-primary bg-primary text-primary-foreground' : passed ? 'bg-muted text-foreground hover:bg-accent' : 'text-muted-foreground hover:bg-accent'
                    )}>
                    <span className={cn('size-2 rounded-full', current ? 'bg-primary-foreground' : JOB_STATUS[s].dot)} />
                    {JOB_STATUS[s].label}
                  </button>
                </form>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- main column ---------- */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="size-4" /> Work</CardTitle>
              <CardDescription>
                {invoiced ? 'Invoiced: work lines are locked. Void the invoice to make changes.'
                  : canPrice ? 'Labour, parts and fees. This becomes the invoice.' : 'Tick items off as you complete them.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LinesEditor jobId={job.id} lines={ls} canPrice={canPrice} labourRate={garage?.labour_rate_pence ?? 0}
                vatRate={vatRate} locked={locked} menu={menu ?? []} />
            </CardContent>
          </Card>

          {advisories.length > 0 && !locked && (
            <Card className="border-warning/40 bg-warning/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-warning" /> From the last MOT</CardTitle>
                <CardDescription>Advisories on {ukDate(tests[0].completedDate)}. Add any you’ll quote for.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {advisories.map((d, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <span className="leading-snug">{d.text}</span>
                      <form suppressHydrationWarning action={addAdvisoryLine}>
                        <input suppressHydrationWarning type="hidden" name="job_id" value={job.id} />
                        <input suppressHydrationWarning type="hidden" name="text" value={d.text} />
                        <Button type="submit" size="sm" variant="outline" className="h-7"><Plus /> Add</Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="size-4" /> Notes</CardTitle></CardHeader>
            <CardContent><NotesForm id={job.id} complaint={job.customer_complaint} notes={job.mechanic_notes} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-4" /> Vehicle health check</CardTitle>
            </CardHeader>
            <CardContent>
              <HealthCheck jobId={job.id} checks={(checkRows ?? []) as HealthItem[]} locked={locked} quoted={ls.map((l) => l.description)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Camera className="size-4" /> Photos</CardTitle>
              <CardDescription>{photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'None yet'}</CardDescription>
            </CardHeader>
            <CardContent><Photos jobId={job.id} photos={photos} /></CardContent>
          </Card>
        </div>

        {/* ---------- side column ---------- */}
        <div className="space-y-6">
          {canPrice && (
            <Card className={cn(activeInvoice ? '' : 'border-primary/30')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Receipt className="size-4" /> Invoice</CardTitle>
                {activeInvoice && (
                  <CardDescription>
                    {activeInvoice.number} · {gbp(activeInvoice.total_pence)}
                    {balance(activeInvoice) === 0 ? ' · Paid' : ` · ${gbp(balance(activeInvoice))} to pay`}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {activeInvoice ? (
                  <Button className="w-full" variant="outline" asChild><Link href={`/invoices/${activeInvoice.id}`}><Receipt /> Open invoice</Link></Button>
                ) : ls.length ? (
                  <IssueInvoiceForm jobId={job.id} today={ukToday()} due={addDays(ukToday(), garage?.payment_terms_days ?? 0)}
                    total={gbp(t.gross)} hasUnpriced={ls.some((l) => l.unit_price_pence === 0)} />
                ) : (
                  <p className="text-sm text-muted-foreground">Add work to the job, then create the invoice.</p>
                )}
                {!activeInvoice && (deposits ?? []).length > 0 && (
                  <ul className="space-y-1 rounded-lg border px-3 py-2 text-sm">
                    {(deposits ?? []).map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <span>Deposit · {PAY_METHODS[d.method] ?? d.method} · {ukDate(d.paid_at)}</span>
                        <span className="flex items-center gap-1 tabular-nums">
                          {gbp(d.amount_pence)}
                          {m.role === 'owner' && (
                            <form suppressHydrationWarning action={removeDeposit}>
                              <input suppressHydrationWarning type="hidden" name="payment_id" value={d.id} />
                              <ConfirmSubmit variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label="Remove deposit"
                                message="Remove this deposit? Only do this if it was recorded by mistake or has been given back.">
                                <Trash2 className="size-3.5" />
                              </ConfirmSubmit>
                            </form>
                          )}
                        </span>
                      </li>
                    ))}
                    <li className="text-xs text-muted-foreground">Moves onto the invoice when you create it.</li>
                  </ul>
                )}
                {!activeInvoice && <DepositForm jobId={job.id} />}
                <a href={`/jobs/${job.id}/sheet?prices=1`} target="_blank" rel="noreferrer" className="block text-xs text-muted-foreground underline-offset-2 hover:underline">
                  Print job sheet with prices
                </a>
                {pastInvoices.map((x) => (
                  <Link key={x.id} href={`/invoices/${x.id}`} className={cn('block text-xs text-muted-foreground hover:text-foreground', x.status === 'void' && 'line-through')}>
                    {x.number} ({x.status === 'void' ? 'void' : 'credited'})
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {canPrice && approvalLines.length > 0 && (
            <Card className={cn(pendingCount > 0 && 'border-violet-500/40')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ThumbsUp className="size-4" /> Customer approval</CardTitle>
                <CardDescription>
                  {pendingCount > 0 ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting for an answer` : 'All items answered'}
                  {' · '}{approvalLines.filter((l) => l.approval === 'approved').length} approved, {approvalLines.filter((l) => l.approval === 'declined').length} declined
                  {job.approval_sent_at && <><br />Sent {ukDate(job.approval_sent_at)}{job.approval_responded_at ? ` · answered ${ukDate(job.approval_responded_at)}` : ''}</>}
                </CardDescription>
              </CardHeader>
              {!locked && (
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">The customer sees the items, prices, health check and photos, and taps approve or decline.</p>
                  <div className="flex flex-wrap gap-2">
                    {wa && (
                      <form suppressHydrationWarning action={markApprovalSent}>
                        <input suppressHydrationWarning type="hidden" name="job_id" value={job.id} />
                        <SendLink href={`${wa}?text=${encodeURIComponent(approvalMsg)}`} label="WhatsApp link" />
                      </form>
                    )}
                    <form suppressHydrationWarning action={markApprovalSent}>
                      <input suppressHydrationWarning type="hidden" name="job_id" value={job.id} />
                      <CopyAndMark url={approvalLink} />
                    </form>
                    <Button size="sm" variant="ghost" asChild><a href={approvalLink} target="_blank" rel="noreferrer"><ExternalLink /> Preview</a></Button>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* time clock */}
          <Card className={cn(myOpen && 'border-success/40')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Timer className="size-4" /> Time</CardTitle>
              <CardDescription>
                {minutesLabel(totalMins)} clocked{soldHours > 0 ? ` · ${soldHours.toFixed(2)} hrs sold` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!locked && (
                <form suppressHydrationWarning action={myOpen ? clockOff : clockOn}>
                  <input suppressHydrationWarning type="hidden" name="job_id" value={job.id} />
                  <Button type="submit" className={cn('w-full', myOpen && 'bg-success text-success-foreground hover:bg-success/90')} size="lg">
                    {myOpen ? <><Square /> Clock off · on since {ukTime(myOpen.started_at)}</> : <><Play /> Clock on to this job</>}
                  </Button>
                </form>
              )}
              {te.length > 0 && (
                <ul className="divide-y text-sm">
                  {te.slice(-6).reverse().map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="flex items-center gap-2">
                        {!e.ended_at && <span className="size-2 animate-pulse rounded-full bg-success" />}
                        {names.get(e.user_id) ?? 'Staff'}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {ukDateOf(e.started_at) !== ukToday() && `${ukDate(e.started_at)} `}
                        {ukTime(e.started_at)}–{e.ended_at ? ukTime(e.ended_at) : 'now'} · {minutesLabel(minsOf(e))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* customer signatures */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PenLine className="size-4" /> Customer signatures</CardTitle>
              <CardDescription>Hand the tablet or phone to the customer. Signatures print on the job sheet.</CardDescription>
            </CardHeader>
            <CardContent>
              <Signatures jobId={job.id} rows={signatures} customerName={job.customer?.name ?? ''}
                authorisation={garage?.authorisation_text?.trim() || DEFAULT_AUTHORISATION} />
            </CardContent>
          </Card>

          {carsOn && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CarFront className="size-4" /> Courtesy car</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {loan ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <RegPlate reg={loan.car?.registration} />
                      <span className="text-muted-foreground">{loan.car?.description}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Out {ukDate(loan.out_at)} {ukTime(loan.out_at)}
                      {loan.due_back_at && ` · due back ${ukDate(loan.due_back_at)} ${ukTime(loan.due_back_at)}`}
                      {loan.mileage_out != null && ` · ${loan.mileage_out.toLocaleString('en-GB')} mi`}{loan.fuel_out && ` · fuel ${loan.fuel_out}`}
                    </p>
                    {canPrice && <ReturnForm loanId={loan.id} />}
                  </>
                ) : canPrice ? <LendForm cars={freeCars} jobId={job.id} compact /> : <p className="text-sm text-muted-foreground">None lent.</p>}
              </CardContent>
            </Card>
          )}

          {fb && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Star className="size-4" /> Customer feedback</CardTitle>
                <CardDescription>
                  {fb.responded_at ? `Answered ${ukDate(fb.responded_at)}` : fb.sent_at ? `Link sent ${ukDate(fb.sent_at)}, no answer yet` : 'Not sent yet'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {fb.score != null && (
                  <div>
                    <div className="flex gap-0.5" aria-label={`${fb.score} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn('size-5', n <= fb.score! ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />)}
                    </div>
                    {fb.comment && <p className="mt-2 text-sm">“{fb.comment}”</p>}
                  </div>
                )}
                {!fb.responded_at && wa && (
                  <form suppressHydrationWarning action={markFeedbackSent}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <SendLink href={`${wa}?text=${encodeURIComponent(`Hi ${firstName}, thanks for choosing ${garage?.name ?? 'us'}. How did we do? It takes ten seconds: ${await siteOrigin()}/f/${fb.token}`)}`} label="Ask by WhatsApp" />
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {/* vehicle */}
          <Card>
            <CardHeader>
              <CardTitle>Vehicle</CardTitle>
              {job.vehicle && <CardAction><Button variant="ghost" size="sm" asChild><Link href={`/vehicles/${job.vehicle.id}`}>Open</Link></Button></CardAction>}
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {job.vehicle ? (
                <>
                  <div className="flex items-center gap-2">
                    <RegPlate reg={job.vehicle.registration} />
                    <span className="font-medium">{[job.vehicle.make, job.vehicle.model].filter(Boolean).join(' ')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    {job.vehicle.colour && <span>{job.vehicle.colour}</span>}
                    <MotBadge due={job.vehicle.mot_due} />
                  </div>
                  <div className="text-muted-foreground">Mileage in: <span className="font-medium text-foreground">{miles(job.mileage_in)}</span></div>
                </>
              ) : <p className="text-muted-foreground">No vehicle linked</p>}
            </CardContent>
          </Card>

          {/* customer */}
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              {job.customer && <CardAction><Button variant="ghost" size="sm" asChild><Link href={`/customers/${job.customer.id}`}>Open</Link></Button></CardAction>}
            </CardHeader>
            <CardContent className="space-y-3">
              {job.customer ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(job.customer.name)}</span>
                    <div>
                      <div className="text-sm font-medium">{job.customer.name}</div>
                      <div className="text-xs text-muted-foreground">{job.customer.phone ?? job.customer.email ?? ''}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.customer.phone && (
                      <Button size="sm" variant="outline" asChild><a href={`tel:${job.customer.phone.replace(/\s/g, '')}`}><Phone /> Call</a></Button>
                    )}
                    {wa && job.status === 'complete' && (
                      <Button size="sm" variant="whatsapp" asChild>
                        <a href={`${wa}?text=${encodeURIComponent(readyMsg)}`} target="_blank" rel="noreferrer"><WhatsAppIcon className="size-4" /> Ready to collect</a>
                      </Button>
                    )}
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground">No customer linked</p>}
            </CardContent>
          </Card>

          {/* details */}
          <Card>
            <CardHeader><CardTitle>Job details</CardTitle></CardHeader>
            <CardContent>
              <DetailsForm
                id={job.id} mileage={job.mileage_in} assignedTo={job.assigned_to} bayId={job.bay_id}
                promisedDate={job.promised_at ? ukDateOf(job.promised_at) : ''}
                promisedTime={job.promised_at ? hhmm(ukMinutesOf(job.promised_at)) : '17:00'}
                bays={opts.bays} mechanics={opts.mechanics}
              />
              {job.booking && (
                <Link href={`/diary/${job.booking.id}`} className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                  <CalendarDays className="size-4" /> From booking on {ukDate(job.booking.starts_at)}
                </Link>
              )}
            </CardContent>
          </Card>

          {m.role !== 'mechanic' && !(deposits ?? []).length && (
            <form suppressHydrationWarning action={deleteJob}>
              <input suppressHydrationWarning type="hidden" name="id" value={job.id} />
              <ConfirmSubmit variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                message={`Delete job ${jobNo(job.job_number)}? Its lines, photos and times will be removed.`}>
                <Trash2 /> Delete job
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
