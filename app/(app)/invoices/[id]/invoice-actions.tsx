'use client';

import { useState } from 'react';
import { Loader2, Copy, Check, Send, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { emailInvoice, recordPayment, voidInvoice } from '../actions';

export function PaymentForm({ invoiceId, owed, today }: { invoiceId: string; owed: number; today: string }) {
  const { formAction, pending, err, state } = useActionToast(recordPayment);
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'form'} className="space-y-3">
      <input suppressHydrationWarning type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount £" htmlFor="amount" error={err('amount')}>
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={(owed / 100).toFixed(2)} aria-invalid={!!err('amount')} />
        </Field>
        <Field label="Method" htmlFor="method" error={err('method')}>
          <NativeSelect id="method" name="method" defaultValue="card">
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="transfer">Bank transfer</option>
          </NativeSelect>
        </Field>
        <Field label="Date" htmlFor="paid_at" error={err('paid_at')}>
          <Input id="paid_at" name="paid_at" type="date" defaultValue={today} />
        </Field>
        <Field label="Reference" htmlFor="reference" optional>
          <Input id="reference" name="reference" placeholder="e.g. card receipt no." />
        </Field>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Record payment</Button>
    </form>
  );
}

export function EmailForm({ invoiceId, defaultTo }: { invoiceId: string; defaultTo: string }) {
  const { formAction, pending, err } = useActionToast(emailInvoice);
  return (
    <form suppressHydrationWarning action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input suppressHydrationWarning type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex-1 space-y-1">
        <Input name="to" type="email" defaultValue={defaultTo} placeholder="customer@example.com" aria-label="Email address" aria-invalid={!!err('to')} />
        {err('to') && <p className="text-xs text-destructive">{err('to')}</p>}
      </div>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Send</Button>
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" onClick={async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success('Link copied');
        setTimeout(() => setCopied(false), 2000);
      } catch { toast.error('Could not copy. Long-press the link instead.'); }
    }}>
      {copied ? <Check /> : <Copy />} Copy link
    </Button>
  );
}

export function VoidForm({ invoiceId }: { invoiceId: string }) {
  const { formAction, pending, err } = useActionToast(voidInvoice);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
        <Ban /> Void invoice
      </Button>
    );
  }
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-2 rounded-lg border border-destructive/30 p-3">
      <input suppressHydrationWarning type="hidden" name="invoice_id" value={invoiceId} />
      <p className="text-sm">Voiding keeps the invoice number on record, marked VOID. You can then correct the job and invoice it again.</p>
      <Input name="reason" placeholder="Reason, e.g. wrong price on brake pads" aria-invalid={!!err('reason')} />
      {err('reason') && <p className="text-xs text-destructive">{err('reason')}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Void invoice</Button>
      </div>
    </form>
  );
}
