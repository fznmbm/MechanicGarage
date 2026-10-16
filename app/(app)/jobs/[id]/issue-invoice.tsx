'use client';
import { useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { issueInvoice } from '../../invoices/actions';

export function IssueInvoiceForm({
  jobId, today, due, total, hasUnpriced,
}: { jobId: string; today: string; due: string; total: string; hasUnpriced: boolean }) {
  const { formAction, pending, err } = useActionToast(issueInvoice);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button className="w-full" onClick={() => setOpen(true)}><Receipt /> Create invoice · {total}</Button>
    );
  }
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-3">
      <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />
      {hasUnpriced && (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-foreground dark:text-warning">
          Some lines are still at £0.00. Price them first if they should be charged.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice date" htmlFor="issued_at" error={err('issued_at')}>
          <Input id="issued_at" name="issued_at" type="date" defaultValue={today} />
        </Field>
        <Field label="Due" htmlFor="due_at" error={err('due_at')}>
          <Input id="due_at" name="due_at" type="date" defaultValue={due} />
        </Field>
      </div>
      <Field label="Note on invoice" htmlFor="notes" optional>
        <Textarea id="notes" name="notes" rows={2} placeholder="e.g. Rear tyres will need replacing soon." />
      </Field>
      <p className="text-xs text-muted-foreground">Once issued, the invoice can’t be edited. Mistakes are fixed by voiding and reissuing.</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Issue invoice</Button>
      </div>
    </form>
  );
}
