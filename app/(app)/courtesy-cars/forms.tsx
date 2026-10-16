'use client';

import { useState } from 'react';
import { Loader2, Plus, X, KeyRound, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { prettyReg } from '@/lib/reg';
import { lendCar, returnCar, saveCar } from './actions';

const FUEL = ['Empty', '1/4', '1/2', '3/4', 'Full'];
export type CarOption = { id: string; registration: string; description: string | null };

export function AddCarForm() {
  const { formAction, pending, err, state } = useActionToast(saveCar);
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="outline" onClick={() => setOpen(true)}><Plus /> Add a car</Button>;
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'form'} className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Add a courtesy car</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}><X /> Close</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Registration" htmlFor="cc_reg" error={err('registration')}>
          <Input id="cc_reg" name="registration" className="uppercase" autoFocus />
        </Field>
        <Field label="Make and model" htmlFor="cc_desc" error={err('description')} optional>
          <Input id="cc_desc" name="description" placeholder="e.g. Silver Ford Fiesta" />
        </Field>
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Add car</Button></div>
    </form>
  );
}

export function LendForm({ cars, jobId, compact }: { cars: CarOption[]; jobId?: string; compact?: boolean }) {
  const { formAction, pending, err } = useActionToast(lendCar);
  const [open, setOpen] = useState(!compact);
  if (!cars.length) return <p className="text-sm text-muted-foreground">No courtesy cars free right now.</p>;
  if (!open) return <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}><KeyRound /> Lend a courtesy car</Button>;
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-3">
      {jobId && <input type="hidden" name="job_id" value={jobId} />}
      <Field label="Car" htmlFor="loan_car" error={err('car_id')}>
        <NativeSelect id="loan_car" name="car_id" defaultValue={cars[0]?.id}>
          {cars.map((c) => <option key={c.id} value={c.id}>{prettyReg(c.registration)}{c.description ? ` · ${c.description}` : ''}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due back" htmlFor="loan_due" error={err('due_date')} optional>
          <Input id="loan_due" name="due_date" type="date" />
        </Field>
        <Field label="Time" htmlFor="loan_time" optional>
          <Input id="loan_time" name="due_time" type="time" defaultValue="17:30" />
        </Field>
        <Field label="Mileage out" htmlFor="loan_miles" error={err('mileage_out')} optional>
          <Input id="loan_miles" name="mileage_out" inputMode="numeric" />
        </Field>
        <Field label="Fuel out" htmlFor="loan_fuel" error={err('fuel_out')} optional>
          <NativeSelect id="loan_fuel" name="fuel_out" defaultValue="">
            <option value="">—</option>{FUEL.map((f) => <option key={f} value={f}>{f}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="licence_checked" className="size-4 accent-primary" /> Driving licence checked
      </label>
      <div className="flex justify-end gap-2">
        {compact && <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Lend car</Button>
      </div>
    </form>
  );
}

export function ReturnForm({ loanId }: { loanId: string }) {
  const { formAction, pending, err } = useActionToast(returnCar);
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><Undo2 /> Returned</Button>;
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-3 rounded-lg border p-3">
      <input type="hidden" name="loan_id" value={loanId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mileage in" htmlFor={`ret_m_${loanId}`} error={err('mileage_in')} optional>
          <Input id={`ret_m_${loanId}`} name="mileage_in" inputMode="numeric" />
        </Field>
        <Field label="Fuel in" htmlFor={`ret_f_${loanId}`} error={err('fuel_in')} optional>
          <NativeSelect id={`ret_f_${loanId}`} name="fuel_in" defaultValue="">
            <option value="">—</option>{FUEL.map((f) => <option key={f} value={f}>{f}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Damage or notes" htmlFor={`ret_n_${loanId}`} optional>
        <Input id={`ret_n_${loanId}`} name="notes" placeholder="e.g. New scuff on rear bumper" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Mark returned</Button>
      </div>
    </form>
  );
}
