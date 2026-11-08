import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BellRing, BellOff, ShieldCheck, Wrench, Lightbulb, ThumbsDown, Send, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { ukDate, whatsappLink } from '@/lib/format';
import { addDays, ukToday } from '@/lib/time';
import { garageLink } from '@/lib/garage-url';
import { reminderMessage, type ReminderKind } from '@/lib/reminders';
import type { MotTest } from '@/lib/vehicle-lookup';
import { cn } from '@/lib/utils';
import { ReminderButtons } from './reminder-buttons';
import { DeclinedWork } from './declined';
import { loadSendList } from './send-data';
import { SendList } from './send-list';

export const metadata = { title: 'Reminders' };

type V = {
  id: string; registration: string; make: string | null; model: string | null; mot_due: string | null; service_due: string | null;
  mot_history: MotTest[] | null;
  customer: { id: string; name: string; phone: string | null; reminder_consent: boolean } | null;
};

const TABS: { key: ReminderKind; label: string; icon: React.ElementType; empty: string }[] = [
  { key: 'mot', label: 'MOT due', icon: ShieldCheck, empty: 'No MOTs due in the next 60 days.' },
  { key: 'service', label: 'Service due', icon: Wrench, empty: 'No services due in the next 60 days.' },
  { key: 'advisory', label: 'Advisory follow-ups', icon: Lightbulb, empty: 'No recent MOT advisories to follow up.' },
];

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { tab } = await searchParams;
  const kind: ReminderKind = tab === 'service' || tab === 'advisory' ? tab : 'mot';
  const declined = tab === 'declined';
  const toSend = !tab || tab === 'send';
  const sendData = await loadSendList(m.garage_id);
  const today = ukToday();
  const from = addDays(today, -30);
  const to = addDays(today, 60);
  const sb = await createClient();

  const sel = 'id, registration, make, model, mot_due, service_due, mot_history, customer:customers(id, name, phone, reminder_consent)';
  const [{ data: garage }, vehiclesRes, { data: logs }] = await Promise.all([
    sb.from('garages').select('name, phone, slug, custom_domain, online_booking_enabled, msg_mot, msg_service, msg_advisory').eq('id', m.garage_id).single(),
    kind === 'mot'
      ? sb.from('vehicles').select(sel).eq('garage_id', m.garage_id).gte('mot_due', from).lte('mot_due', to).order('mot_due').limit(200)
      : kind === 'service'
        ? sb.from('vehicles').select(sel).eq('garage_id', m.garage_id).gte('service_due', from).lte('service_due', to).order('service_due').limit(200)
        : sb.from('vehicles').select(sel).eq('garage_id', m.garage_id).not('mot_history', 'is', null).order('mot_checked_at', { ascending: false }).limit(400),
    sb.from('reminder_log').select('vehicle_id, kind, channel, sent_at').eq('garage_id', m.garage_id).eq('kind', kind)
      .gte('sent_at', `${addDays(today, -120)}T00:00:00Z`).order('sent_at', { ascending: false }),
  ]);

  const last = new Map<string, { channel: string; sent_at: string }>();
  for (const l of logs ?? []) if (!last.has(l.vehicle_id)) last.set(l.vehicle_id, l);

  let rows = ((vehiclesRes.data ?? []) as unknown as V[]).filter((v) => v.customer);
  const advisoriesOf = (v: V) => (v.mot_history?.[0]?.defects ?? []).filter((d) => d.type === 'ADVISORY').map((d) => d.text);
  if (kind === 'advisory') {
    const cutoff = addDays(today, -270);
    rows = rows.filter((v) => advisoriesOf(v).length > 0 && (v.mot_history?.[0]?.completedDate ?? '').slice(0, 10) >= cutoff).slice(0, 100);
  }
  const bookUrl = garage?.online_booking_enabled ? garageLink(garage, '/book') : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Reminders" description="Customers to contact. Tapping WhatsApp or Call records that you’ve reminded them." />

      <div className="flex flex-wrap gap-1.5">
        {[{ key: 'send', label: 'To send', icon: Send }, ...TABS, { key: 'declined', label: 'Declined work', icon: ThumbsDown }].map((t) => {
          const active = toSend ? t.key === 'send' : declined ? t.key === 'declined' : kind === t.key;
          return (
            <Link key={t.key} href={`/reminders?tab=${t.key}`}
              className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium',
                active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              <t.icon className="size-4" /> {t.label}
              {t.key === 'send' && sendData.waiting > 0 && (
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-[#25D366] text-[#052e16]')}>{sendData.waiting}</span>
              )}
            </Link>
          );
        })}
      </div>

      {toSend ? (
        sendData.off ? (
          <Card className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><BellRing className="size-6" /></span>
            <div>
              <p className="font-medium">{sendData.off === 'disabled' ? 'Automatic reminders are switched off' : 'Reminders are set to email only'}</p>
              <p className="text-sm text-muted-foreground">
                {m.role === 'owner' ? 'Switch on WhatsApp reminders in Settings and customers due an MOT or service will appear here each day.' : 'Ask the owner to switch on WhatsApp reminders in Settings.'}
              </p>
            </div>
            {m.role === 'owner' && <Button asChild><Link href="/settings?tab=reminders"><Settings /> Reminder settings</Link></Button>}
          </Card>
        ) : (
          <>
            <SendList items={sendData.items} sent={sendData.sent} desktopHint />
            {sendData.noConsent > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {sendData.noConsent} more customer{sendData.noConsent === 1 ? ' is' : 's are'} due but {sendData.noConsent === 1 ? 'hasn’t' : 'haven’t'} agreed to reminders or {sendData.noConsent === 1 ? 'has' : 'have'} no mobile number. See the <Link href="/reminders?tab=mot" className="underline underline-offset-4">MOT due</Link> list.
              </p>
            )}
          </>
        )
      ) : declined ? <DeclinedWork garageId={m.garage_id} garageName={garage?.name ?? ''} bookUrl={bookUrl} /> : (

      <Card className="gap-0 py-0">
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((v) => {
              const c = v.customer!;
              const due = kind === 'mot' ? v.mot_due : kind === 'service' ? v.service_due : null;
              const adv = kind === 'advisory' ? advisoriesOf(v) : undefined;
              const msg = reminderMessage({
                kind, firstName: c.name.split(' ')[0], garage: garage?.name ?? '', phone: garage?.phone ?? null,
                registration: v.registration, make: v.make, due, bookUrl, overdue: !!due && due < today, advisories: adv,
                template: garage?.[`msg_${kind}` as 'msg_mot'],
              });
              const wa = whatsappLink(c.phone);
              const l = last.get(v.id);
              return (
                <li key={v.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Link href={`/vehicles/${v.id}`}><RegPlate reg={v.registration} className="text-sm" /></Link>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'} · <Link href={`/customers/${c.id}`} className="hover:underline">{c.name}</Link>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {kind === 'mot' && <MotBadge due={v.mot_due} />}
                        {kind === 'service' && <Badge variant="outline">Service due {ukDate(v.service_due)}</Badge>}
                        {kind === 'advisory' && <span className="line-clamp-1">{adv!.length} advisor{adv!.length === 1 ? 'y' : 'ies'}: {adv![0]}</span>}
                        {c.reminder_consent
                          ? <span className="flex items-center gap-1 text-success"><BellRing className="size-3" /> Wants reminders</span>
                          : <span className="flex items-center gap-1"><BellOff className="size-3" /> No reminder consent</span>}
                        {l && <span>· Reminded {ukDate(l.sent_at)} ({l.channel})</span>}
                      </div>
                    </div>
                  </div>
                  <ReminderButtons vehicleId={v.id} kind={kind} due={due}
                    waUrl={wa ? `${wa}?text=${encodeURIComponent(msg)}` : null} tel={c.phone ? c.phone.replace(/\s/g, '') : null} />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><BellRing className="size-6" /></span>
            <p className="font-medium">{TABS.find((t) => t.key === kind)!.empty}</p>
            <p className="text-sm text-muted-foreground">Vehicles with an owner appear here as their dates come up.</p>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}
