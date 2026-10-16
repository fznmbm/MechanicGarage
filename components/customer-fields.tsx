'use client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';

export type CustomerDefaults = {
  name?: string | null; phone?: string | null; email?: string | null; address?: string | null;
  postcode?: string | null; notes?: string | null; reminder_consent?: boolean | null;
};

/** Customer inputs. `prefix` lets them sit inside another form (e.g. "new_") */
export function CustomerFields({
  prefix = '', d = {}, err, compact = false,
}: { prefix?: string; d?: CustomerDefaults; err: (k: string) => string | undefined; compact?: boolean }) {
  const id = (k: string) => `${prefix}${k}`;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" htmlFor={id('name')} error={err(id('name'))} className="sm:col-span-2">
        <Input id={id('name')} name={id('name')} defaultValue={d.name ?? ''} autoComplete="off" aria-invalid={!!err(id('name'))} />
      </Field>
      <Field label="Mobile / phone" htmlFor={id('phone')} error={err(id('phone'))}>
        <Input id={id('phone')} name={id('phone')} type="tel" defaultValue={d.phone ?? ''} placeholder="07700 900123"
          aria-invalid={!!err(id('phone'))} />
      </Field>
      <Field label="Email" htmlFor={id('email')} error={err(id('email'))} optional>
        <Input id={id('email')} name={id('email')} type="email" defaultValue={d.email ?? ''} aria-invalid={!!err(id('email'))} />
      </Field>
      {!compact && (
        <Field label="Address" htmlFor={id('address')} error={err(id('address'))} optional className="sm:col-span-2">
          <Textarea id={id('address')} name={id('address')} rows={2} defaultValue={d.address ?? ''} />
        </Field>
      )}
      <Field label="Postcode" htmlFor={id('postcode')} error={err(id('postcode'))} optional>
        <Input id={id('postcode')} name={id('postcode')} defaultValue={d.postcode ?? ''} className="uppercase"
          aria-invalid={!!err(id('postcode'))} />
      </Field>
      {!compact && (
        <Field label="Notes" htmlFor={id('notes')} optional className="sm:col-span-2"
          hint="Only visible to your staff. For example: prefers calls after 5pm, key safe code.">
          <Textarea id={id('notes')} name={id('notes')} rows={2} defaultValue={d.notes ?? ''} />
        </Field>
      )}
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
        <input suppressHydrationWarning type="checkbox" name={id('reminder_consent')} defaultChecked={!!d.reminder_consent}
          className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>
          <span className="font-medium">Happy to receive MOT and service reminders</span>
          <span className="block text-muted-foreground">Ask the customer first. Reminders are only sent to customers who agree.</span>
        </span>
      </label>
    </div>
  );
}
