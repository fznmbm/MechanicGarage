import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { isYmd, ukLocalToUtcISO, addDays } from '@/lib/time';
import type { InvoiceBuyer, InvoiceVehicle } from '@/lib/invoice';

const cell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;          // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const money = (p: number) => (p / 100).toFixed(2);

export async function GET(req: Request) {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return new Response('Not allowed', { status: 403 });
  const u = new URL(req.url);
  const type = u.searchParams.get('type') ?? 'invoices';
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  if (!isYmd(from) || !isYmd(to)) return new Response('Bad dates', { status: 400 });
  const sb = await createClient();
  let rows: unknown[][] = [];

  if (type === 'payments') {
    const { data } = await sb.from('payments')
      .select('paid_at, amount_pence, method, reference, job_id, booking_id, invoice:invoices(number, buyer)')
      .eq('garage_id', m.garage_id).gte('paid_at', ukLocalToUtcISO(from, '00:00')).lt('paid_at', ukLocalToUtcISO(addDays(to, 1), '00:00')).order('paid_at');
    rows = [['Date', 'Invoice', 'Customer', 'Method', 'Amount', 'Reference'],
      ...((data ?? []) as unknown as { paid_at: string; amount_pence: number; method: string; reference: string | null; job_id: string | null; booking_id: string | null; invoice: { number: string; buyer: InvoiceBuyer } | null }[])
        .map((p) => [dmy(p.paid_at.slice(0, 10)), p.invoice?.number ?? (p.job_id || p.booking_id ? 'Deposit (not yet invoiced)' : ''),
          p.invoice?.buyer?.name, p.method, money(p.amount_pence), p.reference])];
  } else if (type === 'credits') {
    const { data } = await sb.from('credit_notes')
      .select('number, issued_at, reason, subtotal_pence, vat_pence, total_pence, refund_pence, buyer, vehicle, invoice:invoices(number)')
      .eq('garage_id', m.garage_id).gte('issued_at', from).lte('issued_at', to).order('issued_at').order('number');
    rows = [['Credit note', 'Date', 'Invoice', 'Customer', 'Registration', 'Reason', 'Net', 'VAT', 'Total', 'Refunded'],
      ...((data ?? []) as unknown as { number: string; issued_at: string; reason: string; subtotal_pence: number; vat_pence: number; total_pence: number;
        refund_pence: number; buyer: InvoiceBuyer; vehicle: InvoiceVehicle; invoice: { number: string } | null }[])
        .map((c) => [c.number, dmy(c.issued_at), c.invoice?.number, c.buyer?.name, c.vehicle?.registration, c.reason,
          money(c.subtotal_pence), money(c.vat_pence), money(c.total_pence), money(c.refund_pence)])];
  } else {
    const { data } = await sb.from('invoices')
      .select('number, issued_at, due_at, status, is_vat_invoice, subtotal_pence, vat_pence, total_pence, paid_pence, credited_pence, buyer, vehicle, lines:invoice_lines(type, description, quantity, unit_price_pence, vat_rate, sort_order)')
      .eq('garage_id', m.garage_id).neq('status', 'void').gte('issued_at', from).lte('issued_at', to).order('issued_at').order('number');
    type Inv = {
      number: string; issued_at: string; due_at: string | null; status: string; is_vat_invoice: boolean; subtotal_pence: number; vat_pence: number;
      total_pence: number; paid_pence: number; credited_pence: number; buyer: InvoiceBuyer; vehicle: InvoiceVehicle;
      lines: { type: string; description: string; quantity: number; unit_price_pence: number; vat_rate: number; sort_order: number }[];
    };
    const invs = (data ?? []) as unknown as Inv[];

    if (type === 'xero') {
      // Xero "Sales invoices" import template. Amounts are tax-exclusive. Check account codes match your chart of accounts.
      rows = [['*ContactName', 'EmailAddress', 'POAddressLine1', 'POPostalCode', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate',
        'Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency']];
      for (const i of invs) {
        for (const l of [...i.lines].sort((a, b) => a.sort_order - b.sort_order)) {
          rows.push([i.buyer?.name ?? 'Cash sale', i.buyer?.email, i.buyer?.address?.replace(/\n/g, ', '), i.buyer?.postcode, i.number, i.vehicle?.registration,
            dmy(i.issued_at), dmy(i.due_at ?? i.issued_at), l.description, Number(l.quantity), money(l.unit_price_pence), '200',
            !i.is_vat_invoice ? 'No VAT' : Number(l.vat_rate) > 0 ? `${Number(l.vat_rate)}% (VAT on Income)` : 'No VAT', 'GBP']);
        }
      }
      // Credit notes: Xero imports a negative-total invoice as a credit note
      const { data: cns } = await sb.from('credit_notes')
        .select('number, issued_at, is_vat, buyer, vehicle, invoice:invoices(number), lines:credit_note_lines(description, quantity, unit_price_pence, vat_rate, sort_order)')
        .eq('garage_id', m.garage_id).gte('issued_at', from).lte('issued_at', to).order('issued_at');
      for (const c of (cns ?? []) as unknown as { number: string; issued_at: string; is_vat: boolean; buyer: InvoiceBuyer; vehicle: InvoiceVehicle;
        invoice: { number: string } | null; lines: { description: string; quantity: number; unit_price_pence: number; vat_rate: number; sort_order: number }[] }[]) {
        for (const l of [...c.lines].sort((a, b) => a.sort_order - b.sort_order)) {
          rows.push([c.buyer?.name ?? 'Cash sale', c.buyer?.email, c.buyer?.address?.replace(/\n/g, ', '), c.buyer?.postcode, c.number,
            `Credit for ${c.invoice?.number ?? ''}`, dmy(c.issued_at), dmy(c.issued_at), l.description, -Number(l.quantity), money(l.unit_price_pence), '200',
            !c.is_vat ? 'No VAT' : Number(l.vat_rate) > 0 ? `${Number(l.vat_rate)}% (VAT on Income)` : 'No VAT', 'GBP']);
        }
      }
    } else {
      rows = [['Invoice', 'Date', 'Due', 'Customer', 'Registration', 'Net', 'VAT', 'Total', 'Paid', 'Credited', 'Balance', 'Status'],
        ...invs.map((i) => [i.number, dmy(i.issued_at), i.due_at ? dmy(i.due_at) : '', i.buyer?.name, i.vehicle?.registration, money(i.subtotal_pence),
          money(i.vat_pence), money(i.total_pence), money(i.paid_pence), money(i.credited_pence), money(Math.max(0, i.total_pence - i.paid_pence - i.credited_pence)),
          i.credited_pence >= i.total_pence && i.credited_pence > 0 ? 'credited' : i.status])];
    }
  }

  return new Response(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ironbay-${type}-${from}-to-${to}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
