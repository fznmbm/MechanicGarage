'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { VehiclePicker, type PickedVehicle } from '@/components/vehicle-picker';
import { useActionToast } from '@/components/use-action-toast';
import { DURATIONS, SERVICE_TYPES, durationLabel } from '@/lib/services';
import { cn } from '@/lib/utils';
import { createBooking, updateBooking } from './actions';

export type BookingDefaults = {
  id?: string;
  service_type?: string;
  date: string;
  time: string;
  duration: number;
  bay_id?: string | null;
  mechanic_id?: string | null;
  status?: string;
  source?: string;
  notes?: string | null;
};

type Option = { id: string; name: string };

export function BookingForm({
  booking, vehicle, bays, mechanics, lookupEnabled,
}: {
  booking: BookingDefaults; vehicle?: PickedVehicle | null; bays: Option[]; mechanics: Option[]; lookupEnabled: boolean;
}) {
  const editing = !!booking.id;
  const { formAction, pending, err } = useActionToast(editing ? updateBooking : createBooking);
  const [service, setService] = useState(booking.service_type ?? '');
  const [duration, setDuration] = useState(booking.duration);
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  return (
    <form suppressHydrationWarning action={formAction} className="space-y-6">
      {editing && <input suppressHydrationWarning type="hidden" name="id" value={booking.id} />}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Vehicle</CardTitle>
          <CardDescription>Search the vehicles on file, or add a new one with the customer’s details.</CardDescription>
        </CardHeader>
        <CardContent>
          <VehiclePicker initial={vehicle} lookupEnabled={lookupEnabled} err={err} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Booking</CardTitle>
          <CardDescription>What’s being done, when, and where.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Work" htmlFor="service_type" error={err('service_type')}>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_TYPES.map((s) => (
                <button key={s.name} type="button"
                  onClick={() => { setService(s.name); setDuration(s.minutes); }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    service === s.name ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                  )}>
                  {s.name}
                </button>
              ))}
            </div>
            <Input id="service_type" name="service_type" value={service} onChange={(e) => setService(e.target.value)}
              placeholder="Or describe the work, e.g. Timing belt replacement" aria-invalid={!!err('service_type')} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Date" htmlFor="date" error={err('date')}>
              <Input id="date" name="date" type="date" defaultValue={booking.date} required />
            </Field>
            <Field label="Start time" htmlFor="time" error={err('time')}>
              <Input id="time" name="time" type="time" step={900} defaultValue={booking.time} required />
            </Field>
            <Field label="Duration" htmlFor="duration" error={err('duration')}>
              <NativeSelect id="duration" name="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {durations.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Bay" htmlFor="bay_id">
              <NativeSelect id="bay_id" name="bay_id" defaultValue={booking.bay_id ?? ''}>
                <option value="">Not assigned</option>
                {bays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Mechanic" htmlFor="mechanic_id">
              <NativeSelect id="mechanic_id" name="mechanic_id" defaultValue={booking.mechanic_id ?? ''}>
                <option value="">Not assigned</option>
                {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Booked by" htmlFor="source">
              <NativeSelect id="source" name="source" defaultValue={booking.source ?? 'phone'}>
                <option value="phone">Phone</option>
                <option value="walk_in">Walk-in</option>
                <option value="email">Email / message</option>
                <option value="online">Online</option>
              </NativeSelect>
            </Field>
            {editing && (
              <Field label="Status" htmlFor="status">
                <NativeSelect id="status" name="status" defaultValue={booking.status ?? 'booked'}>
                  <option value="booked">Booked</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="arrived">Arrived</option>
                  <option value="no_show">No-show</option>
                  <option value="cancelled">Cancelled</option>
                </NativeSelect>
              </Field>
            )}
          </div>

          <Field label="Notes" htmlFor="notes" optional hint="For example: customer waiting, courtesy car needed, reported rattle from front.">
            <Textarea id="notes" name="notes" rows={3} defaultValue={booking.notes ?? ''} />
          </Field>

          {err('clash') && (
            <Alert className="border-warning/50 bg-warning/10">
              <AlertTriangle className="text-warning" />
              <AlertTitle>Double booking</AlertTitle>
              <AlertDescription>
                <p>{err('clash')}</p>
                <label className="mt-2 flex items-center gap-2 font-medium text-foreground">
                  <input suppressHydrationWarning type="checkbox" name="allow_clash" className="size-4 accent-[var(--primary)]" />
                  Book it anyway
                </label>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button type="button" variant="ghost" asChild>
            <Link href={editing ? `/diary/${booking.id}` : `/diary?date=${booking.date}`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {editing ? 'Save changes' : 'Create booking'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
