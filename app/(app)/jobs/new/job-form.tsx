'use client';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { VehiclePicker, type PickedVehicle } from '@/components/vehicle-picker';
import { useActionToast } from '@/components/use-action-toast';
import { createJob } from '../actions';

type Option = { id: string; name: string };

export function NewJobForm({
  vehicle, bays, mechanics, lookupEnabled, today,
}: { vehicle?: PickedVehicle | null; bays: Option[]; mechanics: Option[]; lookupEnabled: boolean; today: string }) {
  const { formAction, pending, err } = useActionToast(createJob);
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Vehicle</CardTitle>
          <CardDescription>For walk-ins and jobs without a booking.</CardDescription>
        </CardHeader>
        <CardContent><VehiclePicker initial={vehicle} lookupEnabled={lookupEnabled} err={err} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Job</CardTitle>
          <CardDescription>What the customer wants doing. You can add labour and parts once the job is open.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Work requested / customer’s description" htmlFor="customer_complaint" error={err('customer_complaint')} className="sm:col-span-2">
            <Textarea id="customer_complaint" name="customer_complaint" rows={3} aria-invalid={!!err('customer_complaint')}
              placeholder="e.g. Grinding noise from front left when braking. Also due a service." />
          </Field>
          <Field label="Mileage in" htmlFor="mileage_in" error={err('mileage_in')} optional>
            <Input id="mileage_in" name="mileage_in" inputMode="numeric" placeholder="e.g. 84,250" />
          </Field>
          <Field label="Mechanic" htmlFor="assigned_to">
            <NativeSelect id="assigned_to" name="assigned_to" defaultValue="">
              <option value="">Not assigned</option>
              {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Bay" htmlFor="bay_id">
            <NativeSelect id="bay_id" name="bay_id" defaultValue="">
              <option value="">Not assigned</option>
              {bays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Promised for" htmlFor="promised_date" error={err('promised_date')} optional>
              <Input id="promised_date" name="promised_date" type="date" defaultValue={today} />
            </Field>
            <Field label="Time" htmlFor="promised_time">
              <Input id="promised_time" name="promised_time" type="time" step={900} defaultValue="17:00" />
            </Field>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button type="button" variant="ghost" asChild><Link href="/jobs">Cancel</Link></Button>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Open job card</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
