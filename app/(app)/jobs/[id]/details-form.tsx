'use client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { updateJobDetails } from '../actions';

type Option = { id: string; name: string };

export function DetailsForm({
  id, mileage, assignedTo, bayId, promisedDate, promisedTime, bays, mechanics,
}: {
  id: string; mileage: number | null; assignedTo: string | null; bayId: string | null;
  promisedDate: string; promisedTime: string; bays: Option[]; mechanics: Option[];
}) {
  const { formAction, pending, err } = useActionToast(updateJobDetails);
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-4">
      <input suppressHydrationWarning type="hidden" name="id" value={id} />
      <Field label="Mileage in" htmlFor="mileage_in" error={err('mileage_in')}>
        <Input id="mileage_in" name="mileage_in" inputMode="numeric" defaultValue={mileage ?? ''} />
      </Field>
      <Field label="Mechanic" htmlFor="assigned_to">
        <NativeSelect id="assigned_to" name="assigned_to" defaultValue={assignedTo ?? ''}>
          <option value="">Not assigned</option>
          {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Bay" htmlFor="bay_id">
        <NativeSelect id="bay_id" name="bay_id" defaultValue={bayId ?? ''}>
          <option value="">Not assigned</option>
          {bays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Promised for" htmlFor="promised_date" error={err('promised_date')}>
          <Input id="promised_date" name="promised_date" type="date" defaultValue={promisedDate} />
        </Field>
        <Field label="Time" htmlFor="promised_time">
          <Input id="promised_time" name="promised_time" type="time" step={900} defaultValue={promisedTime} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save details
      </Button>
    </form>
  );
}
