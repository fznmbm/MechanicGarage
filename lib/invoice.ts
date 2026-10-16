// Shared invoice document shape (from the invoice_doc / invoice_doc_public SQL functions)

export type InvoiceSeller = {
  name: string; address: string | null; postcode: string | null; phone: string | null; email: string | null;
  website: string | null; logo_url: string | null; brand_colour: string | null; vat_number: string | null;
  bank_details: string | null; terms: string | null; payment_link_url?: string | null;
};
export type InvoiceBuyer = { name: string | null; address: string | null; postcode: string | null; phone: string | null; email: string | null };
export type InvoiceVehicle = { registration: string | null; make: string | null; model: string | null; mileage: number | null; job_number: number | null };

export type InvoiceRow = {
  id: string; garage_id: string; job_id: string | null; customer_id: string | null; number: string;
  issued_at: string; due_at: string | null; is_vat_invoice: boolean; vat_number: string | null;
  subtotal_pence: number; vat_pence: number; total_pence: number; paid_pence: number;
  status: 'draft' | 'issued' | 'part_paid' | 'paid' | 'void'; notes: string | null; public_token: string;
  emailed_at: string | null; voided_at: string | null; void_reason: string | null; created_at: string;
  seller: InvoiceSeller; buyer: InvoiceBuyer; vehicle: InvoiceVehicle;
};
export type InvoiceLineRow = {
  id: string; type: 'labour' | 'part' | 'fee'; description: string; quantity: number | string; unit_price_pence: number;
  vat_rate: number | string; line_total_pence: number; part_number: string | null;
};
export type PaymentRow = { id: string; amount_pence: number; method: string; paid_at: string; reference: string | null };

export type InvoiceDoc = { invoice: InvoiceRow; lines: InvoiceLineRow[]; payments: PaymentRow[] };

export const balance = (i: Pick<InvoiceRow, 'total_pence' | 'paid_pence' | 'status'>) =>
  i.status === 'void' ? 0 : Math.max(0, i.total_pence - i.paid_pence);

export type DisplayStatus = 'paid' | 'part_paid' | 'unpaid' | 'overdue' | 'void';

export function displayStatus(i: Pick<InvoiceRow, 'status' | 'due_at' | 'total_pence' | 'paid_pence'>, today: string): DisplayStatus {
  if (i.status === 'void') return 'void';
  if (i.status === 'paid') return 'paid';
  if (i.due_at && i.due_at < today) return 'overdue';
  return i.status === 'part_paid' ? 'part_paid' : 'unpaid';
}

export const STATUS_STYLE: Record<DisplayStatus, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'border-success/30 bg-success/10 text-success' },
  part_paid: { label: 'Part paid', className: 'border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning' },
  unpaid: { label: 'Unpaid', className: 'border-primary/30 bg-primary/10 text-primary' },
  overdue: { label: 'Overdue', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  void: { label: 'Void', className: 'text-muted-foreground line-through' },
};

export const PAY_METHODS: Record<string, string> = { cash: 'Cash', card: 'Card', transfer: 'Bank transfer', stripe: 'Online' };

/** VAT summary grouped by rate (UK VAT invoices show VAT per rate) */
export function vatSummary(lines: InvoiceLineRow[]) {
  const map = new Map<number, number>();
  for (const l of lines) {
    const r = Number(l.vat_rate);
    map.set(r, (map.get(r) ?? 0) + l.line_total_pence);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([rate, net]) => ({ rate, net }));
}

export const qty = (q: number | string) => {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
};

export const brandOf = (s: InvoiceSeller) => (s.brand_colour && /^#[0-9a-fA-F]{6}$/.test(s.brand_colour) ? s.brand_colour : '#1A5BA6');
