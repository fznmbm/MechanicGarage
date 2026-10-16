'use client';

import { useState } from 'react';
import { Loader2, Copy, Check, Send, Ban, FileMinus2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { Textarea } from '@/components/ui/textarea';
import { gbp } from '@/lib/format';
import { qty as fmtQty } from '@/lib/invoice';
import { cn } from '@/lib/utils';
import { emailCreditNote, emailInvoice, issueCreditNote, recordPayment, recordRefund, takeDeposit, voidInvoice } from '../actions';

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

export function EmailForm({ invoiceId, defaultTo, credit }: { invoiceId: string; defaultTo: string; credit?: boolean }) {
  const { formAction, pending, err } = useActionToast(credit ? emailCreditNote : emailInvoice);
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

const REFUND_METHODS = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank transfer' },
];

export type CreditableLine = { id: string; description: string; type: string; quantity: number; left: number; unit_price_pence: number };

/** Owner: credit the whole invoice, some items, or an amount */
export function CreditNoteForm({ invoiceId, lines, left, paid, nothingCreditedYet, vat, today }: {
  invoiceId: string; lines: CreditableLine[]; left: number; paid: number; nothingCreditedYet: boolean; vat: boolean; today: string;
}) {
  const { formAction, pending, err } = useActionToast(issueCreditNote);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'all' | 'lines' | 'amount'>(nothingCreditedYet ? 'all' : 'lines');
  if (!open) {
    return <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}><FileMinus2 /> Issue a credit note</Button>;
  }
  const modes = [
    ...(nothingCreditedYet ? [{ v: 'all' as const, label: 'Whole invoice', hint: 'Cancel it in full, e.g. to correct and re-invoice the job' }] : []),
    { v: 'lines' as const, label: 'Some items', hint: 'Returned parts or work not done' },
    { v: 'amount' as const, label: 'An amount', hint: 'Goodwill or a price correction' },
  ];
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-4">
      <input suppressHydrationWarning type="hidden" name="invoice_id" value={invoiceId} />
      <input suppressHydrationWarning type="hidden" name="mode" value={mode} />
      <div className="grid gap-2">
        {modes.map((x) => (
          <button key={x.v} type="button" onClick={() => setMode(x.v)}
            className={cn('rounded-lg border p-3 text-left text-sm transition', mode === x.v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent')}>
            <div className="font-medium">{x.label}</div>
            <div className="text-xs text-muted-foreground">{x.hint}</div>
          </button>
        ))}
      </div>

      {mode === 'all' && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">Credits {gbp(left)}. The job unlocks so you can correct it and invoice it again; anything already paid moves to the new invoice.</p>
      )}
      {mode === 'lines' && (
        <div className="space-y-2">
          {lines.filter((l) => l.left > 0).map((l) => (
            <div key={l.id} className="flex items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate">{l.description}</div>
                <div className="text-xs text-muted-foreground">{fmtQty(l.left)} of {fmtQty(l.quantity)} left · {gbp(l.unit_price_pence)} each{vat ? ' ex VAT' : ''}</div>
                {err(`qty_${l.id}`) && <div className="text-xs text-destructive">{err(`qty_${l.id}`)}</div>}
              </div>
              <Input name={`qty_${l.id}`} inputMode="decimal" placeholder="0" className="h-8 w-20 text-right" aria-label={`Quantity of ${l.description} to credit`} />
            </div>
          ))}
          {err('lines') && <p className="text-xs text-destructive">{err('lines')}</p>}
        </div>
      )}
      {mode === 'amount' && (
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Description" htmlFor="cn_description" optional>
            <Input id="cn_description" name="description" placeholder="e.g. Goodwill discount" />
          </Field>
          <Field label={vat ? 'Amount inc VAT £' : 'Amount £'} htmlFor="cn_amount" error={err('amount')}>
            <Input id="cn_amount" name="amount" inputMode="decimal" placeholder={(left / 100).toFixed(2)} aria-invalid={!!err('amount')} />
          </Field>
        </div>
      )}

      <Field label="Reason" htmlFor="cn_reason" error={err('reason')} hint="Printed on the credit note.">
        <Textarea id="cn_reason" name="reason" rows={2} placeholder="e.g. Brake pads returned unused" aria-invalid={!!err('reason')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="cn_date" error={err('issued_at')}>
          <Input id="cn_date" name="issued_at" type="date" defaultValue={today} />
        </Field>
        {paid > 0 && (
          <Field label="Refund now?" htmlFor="cn_refund" error={err('refund_method')}>
            <NativeSelect id="cn_refund" name="refund_method" defaultValue="">
              <option value="">No, keep as credit</option>
              {REFUND_METHODS.map((m) => <option key={m.value} value={m.value}>Yes, by {m.label.toLowerCase()}</option>)}
            </NativeSelect>
          </Field>
        )}
      </div>
      {paid > 0 && <p className="text-xs text-muted-foreground">A refund is recorded for whatever the customer has overpaid once this is credited.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Issue credit note</Button>
      </div>
    </form>
  );
}

export function RefundForm({ invoiceId, amount }: { invoiceId: string; amount: number }) {
  const { formAction, pending, err, state } = useActionToast(recordRefund);
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'form'} className="space-y-3">
      <input suppressHydrationWarning type="hidden" name="invoice_id" value={invoiceId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Refund £" htmlFor="refund_amount" error={err('amount')}>
          <Input id="refund_amount" name="amount" inputMode="decimal" defaultValue={(amount / 100).toFixed(2)} />
        </Field>
        <Field label="Method" htmlFor="refund_method" error={err('method')}>
          <NativeSelect id="refund_method" name="method" defaultValue="card">
            {REFUND_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Button type="submit" variant="outline" className="w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Record refund</Button>
    </form>
  );
}

/** Deposit against a job or a booking (before there is an invoice) */
export function DepositForm({ jobId, bookingId }: { jobId?: string; bookingId?: string }) {
  const { formAction, pending, err, state } = useActionToast(takeDeposit);
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Take a deposit</Button>;
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'form'} className="space-y-3">
      {jobId && <input suppressHydrationWarning type="hidden" name="job_id" value={jobId} />}
      {bookingId && <input suppressHydrationWarning type="hidden" name="booking_id" value={bookingId} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount £" htmlFor="dep_amount" error={err('amount')}>
          <Input id="dep_amount" name="amount" inputMode="decimal" placeholder="50.00" />
        </Field>
        <Field label="Method" htmlFor="dep_method" error={err('method')}>
          <NativeSelect id="dep_method" name="method" defaultValue="card">
            {REFUND_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Take deposit</Button>
      </div>
    </form>
  );
}
