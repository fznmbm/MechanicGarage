import { gbp } from './format';
import { jobNo } from './jobs';

export type AuditEntry = {
  id: number; at: string; actor: string | null; table_name: string; label: string | null;
  action: 'insert' | 'update' | 'delete'; changes: Record<string, unknown> | null;
};

const THING: Record<string, string> = {
  invoices: 'invoice', payments: 'payment', credit_notes: 'credit note', customers: 'customer', vehicles: 'vehicle',
  jobs: 'job', job_lines: 'work line', bookings: 'booking', estimates: 'estimate', garage_members: 'staff member',
  invites: 'staff invite', garages: 'garage settings',
};

const FIELD: Record<string, string> = {
  bank_details: 'Bank details', payment_link_url: 'Payment link', vat_registered: 'VAT registered', vat_number: 'VAT number',
  vat_effective_from: 'VAT from', default_vat_rate: 'VAT rate', labour_rate_pence: 'Labour rate', invoice_prefix: 'Invoice prefix',
  invoice_terms: 'Invoice terms', name: 'Name', phone: 'Phone', email: 'Email', address: 'Address', postcode: 'Postcode',
  role: 'Role', active: 'Active', display_name: 'Name', unit_price_pence: 'Price', quantity: 'Quantity', description: 'Description',
  amount_pence: 'Amount', method: 'Method', reference: 'Reference', status: 'Status', void_reason: 'Void reason', due_at: 'Due date',
  notes: 'Notes', mfa_required_roles: 'Two-factor required for', reminder_consent: 'Reminder consent', approval: 'Customer approval',
  no_vat: 'No VAT', logo_url: 'Logo', brand_colour: 'Colour',
};

/** Settings worth drawing attention to: they change where money goes or who can get in */
export const SENSITIVE = new Set(['bank_details', 'payment_link_url', 'role', 'active', 'mfa_required_roles', 'vat_number', 'vat_registered']);

const show = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (k.endsWith('_pence') && typeof v === 'number') return gbp(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
};

/** Plain-English line for one activity entry, plus field-by-field details for changes */
export function describe(e: AuditEntry): { text: string; details: { field: string; from?: string; to: string; sensitive: boolean }[] } {
  const c = e.changes ?? {};
  const thing = THING[e.table_name] ?? e.table_name;
  const label = e.table_name === 'jobs' && e.label ? jobNo(Number(e.label)) : e.label;
  let text: string;
  if (e.table_name === 'payments' && e.action !== 'update') {
    const amt = typeof c.amount_pence === 'number' ? c.amount_pence : 0;
    text = e.action === 'insert'
      ? `${amt < 0 ? `recorded a refund of ${gbp(-amt)}` : `recorded a payment of ${gbp(amt)}`}${c.method ? ` (${c.method})` : ''}${c.invoice_id ? '' : ' as a deposit'}`
      : `deleted a payment of ${gbp(amt)}`;
  } else if (e.table_name === 'invoices' && e.action === 'update' && Array.isArray(c.status) && c.status[1] === 'void') {
    text = `voided invoice ${label}`;
  } else if (e.action === 'insert') {
    text = `${e.table_name === 'invoices' ? 'issued' : e.table_name === 'invites' ? 'invited' : 'created'} ${thing} ${label ?? ''}`.trim();
  } else if (e.action === 'delete') {
    text = `deleted ${thing} ${label ?? ''}`.trim();
  } else {
    text = `changed ${thing}${e.table_name === 'garages' ? '' : ` ${label ?? ''}`}`.trim();
  }
  const details = e.action === 'update'
    ? Object.entries(c).filter(([k]) => k !== 'updated_at').map(([k, v]) => {
        const [from, to] = Array.isArray(v) && v.length === 2 ? v : [undefined, v];
        return { field: FIELD[k] ?? k.replace(/_/g, ' '), from: show(k, from), to: show(k, to), sensitive: SENSITIVE.has(k) };
      })
    : [];
  return { text, details };
}
