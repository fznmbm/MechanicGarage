'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { orNull, str } from '@/lib/validate';
import { isYmd } from '@/lib/time';
import { parsePounds } from '@/lib/money';
import { gbp, ukDate } from '@/lib/format';
import { balance } from '@/lib/invoice';
import { renderInvoicePdf, pdfFilename } from '@/lib/invoice-pdf';
import { emailConfigured, escapeHtml, sendEmail } from '@/lib/email';
import { siteOrigin } from '@/lib/url';
import type { ActionState } from '@/lib/types';
import { loadInvoice } from './data';

const fail = (errors: Record<string, string>, message = 'Please fix the highlighted fields'): ActionState =>
  ({ ok: false, message, errors, ts: Date.now() });
const oops = (message: string): ActionState => ({ ok: false, message, ts: Date.now() });
const done = (message: string): ActionState => ({ ok: true, message, ts: Date.now() });

async function staff() {
  const m = await getMembership();
  if (!m || m.role === 'mechanic') return null;
  return { m, sb: await createClient() };
}

const touch = (id: string, jobId?: string | null) => {
  revalidatePath(`/invoices/${id}`);
  revalidatePath('/invoices');
  revalidatePath('/');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
};

export async function issueInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can issue invoices');
  const jobId = str(fd, 'job_id');
  const issue = str(fd, 'issued_at');
  const due = str(fd, 'due_at');
  const errors: Record<string, string> = {};
  if (!isYmd(issue)) errors.issued_at = 'Pick the invoice date';
  if (due && !isYmd(due)) errors.due_at = 'Pick a due date';
  else if (due && due < issue) errors.due_at = 'Due date can’t be before the invoice date';
  if (Object.keys(errors).length) return fail(errors);

  const { data, error } = await c.sb.rpc('issue_invoice', {
    p_job: jobId, p_issue: issue, p_due: due || null, p_notes: orNull(str(fd, 'notes')),
  });
  if (error) return oops(error.message);
  touch(data as string, jobId);
  redirect(`/invoices/${data}?created=1`);
}

export async function recordPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can record payments');
  const id = str(fd, 'invoice_id');
  const amount = parsePounds(str(fd, 'amount'));
  const method = str(fd, 'method');
  const date = str(fd, 'paid_at');
  const errors: Record<string, string> = {};

  const { data: inv } = await c.sb.from('invoices').select('id, job_id, total_pence, paid_pence, status')
    .eq('id', id).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!inv) return oops('Invoice not found');
  if (inv.status === 'void') return oops('This invoice is void');

  if (amount === null || amount <= 0) errors.amount = 'Enter the amount paid, e.g. 120.00';
  else if (amount > balance(inv) + 1) errors.amount = `That’s more than the ${gbp(balance(inv))} owed`;
  if (!['cash', 'card', 'transfer', 'stripe'].includes(method)) errors.method = 'Choose how they paid';
  if (!isYmd(date)) errors.paid_at = 'Pick the date';
  if (Object.keys(errors).length) return fail(errors);

  const { error } = await c.sb.from('payments').insert({
    garage_id: c.m.garage_id, invoice_id: id, amount_pence: amount, method,
    paid_at: `${date}T12:00:00Z`, reference: orNull(str(fd, 'reference')),
  });
  if (error) return oops(error.message);
  touch(id, inv.job_id);
  return done(`Payment of ${gbp(amount!)} recorded`);
}

export async function deletePayment(fd: FormData) {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return;
  const id = str(fd, 'invoice_id');
  await c.sb.from('payments').delete().eq('id', str(fd, 'payment_id')).eq('garage_id', c.m.garage_id);
  touch(id);
}

export async function voidInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c || c.m.role !== 'owner') return oops('Only the owner can void invoices');
  const id = str(fd, 'invoice_id');
  const reason = str(fd, 'reason');
  if (!reason) return fail({ reason: 'Say why, e.g. “Wrong price on brake pads, reissued”' });
  const { data: inv } = await c.sb.from('invoices').select('job_id, paid_pence').eq('id', id).eq('garage_id', c.m.garage_id).maybeSingle();
  if (!inv) return oops('Invoice not found');
  if (inv.paid_pence > 0) return oops('Remove the payments first, then void the invoice');
  const { error } = await c.sb.from('invoices')
    .update({ status: 'void', voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', id).eq('garage_id', c.m.garage_id);
  if (error) return oops(error.message);
  touch(id, inv.job_id);
  return done('Invoice voided. The job can now be invoiced again.');
}

export async function emailInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const c = await staff();
  if (!c) return oops('Only the owner or reception can email invoices');
  if (!emailConfigured()) return oops('Email sending is not set up yet');
  const id = str(fd, 'invoice_id');
  const to = str(fd, 'to').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail({ to: 'Enter a valid email address' });

  const doc = await loadInvoice(id);
  if (!doc) return oops('Invoice not found');
  const i = doc.invoice;
  const owed = balance(i);
  const link = `${await siteOrigin()}/i/${i.public_token}`;
  const first = i.buyer.name?.split(' ')[0] ?? 'there';
  const reg = i.vehicle.registration ? ` for ${i.vehicle.registration}` : '';

  const text = [
    `Hi ${first},`, '',
    `Please find attached invoice ${i.number}${reg} from ${i.seller.name}.`,
    owed > 0 ? `Amount due: ${gbp(owed)}${i.due_at && i.due_at !== i.issued_at ? ` by ${ukDate(i.due_at)}` : ''}.` : 'This invoice has been paid in full. Thank you.',
    '', `View it online: ${link}`, '', 'Thanks,', i.seller.name, i.seller.phone ?? '',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5">
    <p>Hi ${escapeHtml(first)},</p>
    <p>Please find attached invoice <b>${escapeHtml(i.number)}</b>${escapeHtml(reg)} from ${escapeHtml(i.seller.name)}.</p>
    <p>${owed > 0 ? `Amount due: <b>${gbp(owed)}</b>${i.due_at && i.due_at !== i.issued_at ? ` by ${ukDate(i.due_at)}` : ''}.` : 'This invoice has been paid in full. Thank you.'}</p>
    <p><a href="${link}" style="display:inline-block;background:#1A5BA6;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View invoice online</a></p>
    <p>Thanks,<br>${escapeHtml(i.seller.name)}${i.seller.phone ? `<br>${escapeHtml(i.seller.phone)}` : ''}</p></div>`;

  const pdf = await renderInvoicePdf(doc);
  const res = await sendEmail({
    to, subject: `Invoice ${i.number} from ${i.seller.name}`, text, html,
    replyTo: i.seller.email, fromName: i.seller.name,
    attachments: [{ filename: pdfFilename(doc), content: pdf }],
  });
  if (!res.ok) return oops(res.error);
  await c.sb.from('invoices').update({ emailed_at: new Date().toISOString() }).eq('id', id);
  touch(id);
  return done(`Invoice emailed to ${to}`);
}
