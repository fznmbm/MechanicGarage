import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Pencil, Trash2, Phone, MessageCircle, CheckCircle2, UserX, XCircle, ThumbsUp, Clock, MapPin, Wrench, User,
  CalendarDays, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { FlashToast } from '@/components/flash-toast';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { initials, ukDate, whatsappLink } from '@/lib/format';
import { ukDateOf, ukLongDate, ukTime } from '@/lib/time';
import { durationLabel } from '@/lib/services';
import { prettyReg } from '@/lib/reg';
import { deleteBooking, setBookingStatus } from '../actions';
import { startJobFromBooking } from '../../jobs/actions';
import { jobNo } from '@/lib/jobs';

export const metadata = { title: 'Booking' };

const STATUS: Record<string, { label: string; className: string }> = {
  booked: { label: 'Booked', className: '' },
  confirmed: { label: 'Confirmed', className: 'border-primary/30 bg-primary/10 text-primary' },
  arrived: { label: 'Arrived', className: 'border-success/30 bg-success/10 text-success' },
  no_show: { label: 'No-show', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
};
const SOURCE: Record<string, string> = { phone: 'Phone', walk_in: 'Walk-in', email: 'Email / message', online: 'Online' };

function StatusButton({ id, status, children, variant = 'outline' }: {
  id: string; status: string; children: React.ReactNode; variant?: 'outline' | 'default' | 'ghost';
}) {
  return (
    <form suppressHydrationWarning action={setBookingStatus}>
      <input suppressHydrationWarning type="hidden" name="id" value={id} />
      <input suppressHydrationWarning type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant}>{children}</Button>
    </form>
  );
}

export default async function BookingPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string }> }) {
  const { id } = await params;
  const { created, saved } = await searchParams;
  const m = (await getMembership())!;
  const sb = await createClient();

  const { data: b } = await sb.from('bookings')
    .select('*, vehicle:vehicles(id, registration, make, model, colour, mot_due), customer:customers(id, name, phone, email), bay:bays(name)')
    .eq('id', id).eq('garage_id', m.garage_id).maybeSingle();
  if (!b) notFound();

  const [{ data: mech }, { data: garage }, { data: job }] = await Promise.all([
    b.mechanic_id
      ? sb.from('garage_members').select('display_name').eq('garage_id', m.garage_id).eq('user_id', b.mechanic_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('garages').select('name, phone').eq('id', m.garage_id).single(),
    sb.from('jobs').select('id, job_number').eq('booking_id', id).eq('garage_id', m.garage_id).maybeSingle(),
  ]);

  const date = ukDateOf(b.starts_at);
  const minutes = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
  const st = STATUS[b.status] ?? STATUS.booked;
  const active = ['booked', 'confirmed', 'arrived'].includes(b.status);

  // Ready-made WhatsApp confirmation (free; opens WhatsApp on the device)
  const wa = whatsappLink(b.customer?.phone);
  const firstName = b.customer?.name?.split(' ')[0] ?? '';
  const msg = `Hi ${firstName}, this is ${garage?.name ?? 'the garage'} confirming your ${b.service_type}` +
    `${b.vehicle ? ` for ${prettyReg(b.vehicle.registration)}` : ''} on ${ukLongDate(date)} at ${ukTime(b.starts_at)}.` +
    `${garage?.phone ? ` Any questions, call us on ${garage.phone}.` : ''} Thanks!`;

  const rows: [React.ElementType, string, React.ReactNode][] = [
    [CalendarDays, 'Date', ukLongDate(date)],
    [Clock, 'Time', `${ukTime(b.starts_at)} – ${ukTime(b.ends_at)} (${durationLabel(minutes)})`],
    [MapPin, 'Bay', b.bay?.name ?? 'Not assigned'],
    [Wrench, 'Mechanic', mech?.display_name ?? 'Not assigned'],
    [Phone, 'Booked by', `${SOURCE[b.source] ?? b.source} · ${ukDate(b.created_at)}`],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <FlashToast message={created ? 'Booking created' : saved ? 'Booking saved' : null} />
      <PageHeader
        title={b.service_type}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={st.className}>{st.label}</Badge>
            {ukLongDate(date)} at {ukTime(b.starts_at)}
          </span>
        }
        actions={<Button variant="outline" asChild><Link href={`/diary/${b.id}/edit`}><Pencil /> Edit</Link></Button>}
      >
        <Link href={`/diary?date=${date}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Diary
        </Link>
      </PageHeader>

      {/* status actions */}
      <div className="flex flex-wrap gap-2">
        {job ? (
          <Button asChild><Link href={`/jobs/${job.id}`}><Wrench /> Open job {jobNo(job.job_number)}</Link></Button>
        ) : active && (
          <form suppressHydrationWarning action={startJobFromBooking}>
            <input suppressHydrationWarning type="hidden" name="booking_id" value={b.id} />
            <Button type="submit"><Wrench /> Start job card</Button>
          </form>
        )}
        {b.status === 'booked' && <StatusButton id={b.id} status="confirmed"><ThumbsUp /> Mark confirmed</StatusButton>}
        {['booked', 'confirmed'].includes(b.status) && (
          <StatusButton id={b.id} status="arrived"><CheckCircle2 /> Vehicle arrived</StatusButton>
        )}
        {['booked', 'confirmed'].includes(b.status) && <StatusButton id={b.id} status="no_show" variant="ghost"><UserX /> No-show</StatusButton>}
        {active && <StatusButton id={b.id} status="cancelled" variant="ghost"><XCircle /> Cancel booking</StatusButton>}
        {!active && <StatusButton id={b.id} status="booked"><Undo2 /> Reinstate booking</StatusButton>}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Booking details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <dl className="divide-y text-sm">
              {rows.map(([Icon, k, v]) => (
                <div key={k} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <Icon className="size-4 text-muted-foreground" />
                  <dt className="w-24 text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {b.notes && <p className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-line">{b.notes}</p>}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Vehicle</CardTitle>
              {b.vehicle && <CardAction><Button variant="ghost" size="sm" asChild><Link href={`/vehicles/${b.vehicle.id}`}>Open</Link></Button></CardAction>}
            </CardHeader>
            <CardContent>
              {b.vehicle ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <RegPlate reg={b.vehicle.registration} className="text-sm" />
                    <span className="font-medium">{[b.vehicle.make, b.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {b.vehicle.colour && <span>{b.vehicle.colour}</span>}
                    <MotBadge due={b.vehicle.mot_due} />
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">No vehicle linked</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              {b.customer && <CardAction><Button variant="ghost" size="sm" asChild><Link href={`/customers/${b.customer.id}`}>Open</Link></Button></CardAction>}
            </CardHeader>
            <CardContent className="space-y-3">
              {b.customer ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initials(b.customer.name)}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{b.customer.name}</div>
                      <div className="text-xs text-muted-foreground">{b.customer.phone ?? b.customer.email ?? ''}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {b.customer.phone && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`tel:${b.customer.phone.replace(/\s/g, '')}`}><Phone /> Call</a>
                      </Button>
                    )}
                    {wa && active && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`${wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
                          <MessageCircle /> Send confirmation
                        </a>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><User className="size-4" /> No customer linked</p>
              )}
            </CardContent>
          </Card>

          {m.role !== 'mechanic' && (
            <form suppressHydrationWarning action={deleteBooking}>
              <input suppressHydrationWarning type="hidden" name="id" value={b.id} />
              <input suppressHydrationWarning type="hidden" name="date" value={date} />
              <ConfirmSubmit variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                message="Delete this booking permanently? To keep a record, cancel it instead.">
                <Trash2 /> Delete booking
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
