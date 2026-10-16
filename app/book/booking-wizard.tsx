'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Check, ChevronLeft, Clock, Loader2, CalendarCheck, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { durationLabel } from '@/lib/services';
import { gbp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getSlots, submitBooking } from './actions';

export type BookingGarage = {
  id: string; name: string; phone: string | null; open_days: number[]; days_ahead: number; message: string | null;
};
export type BookingService = { id: string; name: string; duration: number; price_from: number | null; description: string | null };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const longDate = (s: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${s}T12:00:00`));

export function BookingWizard({ garage, services, today }: { garage: BookingGarage; services: BookingService[]; today: string }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [service, setService] = useState<BookingService | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [form, setForm] = useState({ reg: '', name: '', phone: '', email: '', notes: '', consent: false, website: '' });

  // open days in the booking window
  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date(`${today}T12:00:00`);
    for (let i = 0; i <= garage.days_ahead && out.length < 60; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.getDay() === 0 ? 7 : d.getDay();
      if (garage.open_days.includes(iso)) out.push(ymd(d));
    }
    return out;
  }, [today, garage.days_ahead, garage.open_days]);

  useEffect(() => {
    if (!service || !date) return;
    startLoad(async () => setSlots(await getSlots(garage.id, date, service.duration)));
  }, [service, date, garage.id]);

  const pickDate = (d: string) => { setDate(d); setTime(null); setSlots(null); };

  const submit = () => {
    setError(null);
    if (form.reg.replace(/[^a-z0-9]/gi, '').length < 2) return setError('Please enter your registration');
    if (form.name.trim().length < 2) return setError('Please enter your name');
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Please enter a phone number we can reach you on');
    startSend(async () => {
      const res = await submitBooking({ garageId: garage.id, serviceId: service!.id, date: date!, time: time!, ...form });
      if (res.ok) { setReference(res.reference); setStep(4); }
      else {
        setError(res.error);
        if (/taken/i.test(res.error)) { setTime(null); setStep(2); setSlots(await getSlots(garage.id, date!, service!.duration)); }
      }
    });
  };

  if (step === 4) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-7" /></span>
        <div>
          <h2 className="text-xl font-semibold">You’re booked in</h2>
          <p className="text-muted-foreground">{service!.name} · {longDate(date!)} at {time}</p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="text-muted-foreground">Booking reference</div>
          <div className="font-mono text-lg font-semibold tracking-widest">{reference}</div>
        </div>
        <p className="text-sm text-muted-foreground">
          {garage.name} will be in touch if anything changes.
          {garage.phone && <> Need to change it? Call <a className="font-medium text-foreground underline" href={`tel:${garage.phone.replace(/\s/g, '')}`}>{garage.phone}</a>.</>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* progress */}
      <ol className="flex items-center gap-2 text-xs font-medium">
        {['Service', 'Date & time', 'Your details'].map((label, i) => (
          <li key={label} className={cn('flex flex-1 items-center gap-2 rounded-full border px-3 py-1.5',
            step === i + 1 ? 'border-primary bg-primary text-primary-foreground' : step > i + 1 ? 'bg-muted' : 'text-muted-foreground')}>
            <span className="tabular-nums">{i + 1}</span><span className="truncate">{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">What do you need?</h2>
          <div className="grid gap-3">
            {services.map((s) => (
              <button key={s.id} type="button" onClick={() => { setService(s); setStep(2); if (!date && days[0]) pickDate(days[0]); else { setTime(null); setSlots(null); } }}
                className={cn('flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-primary hover:bg-primary/5',
                  service?.id === s.id && 'border-primary bg-primary/5')}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  {s.description && <div className="text-sm text-muted-foreground">{s.description}</div>}
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" /> About {durationLabel(s.duration)}</div>
                </div>
                {s.price_from != null && (
                  <div className="text-right"><div className="text-xs text-muted-foreground">from</div><div className="font-semibold">{gbp(s.price_from)}</div></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && service && (
        <div className="space-y-4">
          <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> {service.name}
          </button>
          <h2 className="text-lg font-semibold">Pick a day</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {days.map((d) => {
              const dt = new Date(`${d}T12:00:00`);
              return (
                <button key={d} type="button" onClick={() => pickDate(d)}
                  className={cn('flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 transition hover:border-primary',
                    date === d && 'border-primary bg-primary text-primary-foreground')}>
                  <span className="text-xs">{dt.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  <span className="text-lg font-semibold">{dt.getDate()}</span>
                  <span className="text-xs">{dt.toLocaleDateString('en-GB', { month: 'short' })}</span>
                </button>
              );
            })}
          </div>
          {date && (
            <div className="space-y-3">
              <h3 className="font-medium">{longDate(date)}</h3>
              {loading || slots === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking availability…</p>
              ) : slots.length ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots.map((t) => (
                    <button key={t} type="button" onClick={() => setTime(t)}
                      className={cn('rounded-lg border py-2 text-sm font-medium tabular-nums transition hover:border-primary',
                        time === t && 'border-primary bg-primary text-primary-foreground')}>
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No times left on this day. Try another day.</p>
              )}
            </div>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button className="w-full" size="lg" disabled={!time} onClick={() => { setError(null); setStep(3); }}>Continue</Button>
        </div>
      )}

      {step === 3 && service && date && time && (
        <div className="space-y-4">
          <button type="button" onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Change time
          </button>
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
            <CalendarCheck className="size-5 text-primary" />
            <div><div className="font-medium">{service.name}</div><div className="text-muted-foreground">{longDate(date)} at {time}</div></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reg">Vehicle registration</Label>
              <Input id="reg" value={form.reg} onChange={(e) => setForm({ ...form, reg: e.target.value.toUpperCase() })} placeholder="AB12 CDE" maxLength={10}
                className="bg-[#F7D117] font-mono font-bold tracking-wider text-black uppercase placeholder:text-black/40 dark:bg-[#F7D117]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Anything we should know? <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Knocking noise from the front, I’ll wait while it’s done" />
            </div>
            {/* honeypot */}
            <input suppressHydrationWarning type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
              <input suppressHydrationWarning type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Remind me when my MOT or service is due. <span className="text-muted-foreground">You can stop these at any time.</span></span>
            </label>
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button className="w-full" size="lg" onClick={submit} disabled={sending}>
            {sending && <Loader2 className="animate-spin" />} Confirm booking
          </Button>
          {garage.phone && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3.5" /> Prefer to talk? Call {garage.phone}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
