import { ukDate } from './format';
import { prettyReg } from './reg';

export type ReminderKind = 'mot' | 'service' | 'advisory';

type Ctx = {
  kind: ReminderKind; firstName: string; garage: string; phone: string | null; registration: string;
  make: string | null; due: string | null; bookUrl: string | null; overdue?: boolean; advisories?: string[];
};

const car = (c: Ctx) => `${c.make ? `${c.make} ` : ''}${prettyReg(c.registration)}`;

/* ---------- Message wording (WhatsApp) ----------
   Garages can change the wording in Settings → Reminders. Fill-ins in {braces} are replaced;
   a line whose fill-in has nothing to show (e.g. no booking link) is left out. *Stars* make WhatsApp text bold. */

export const MESSAGE_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'First name' },
  { key: 'vehicle', label: 'Make' },
  { key: 'reg', label: 'Registration' },
  { key: 'date', label: 'Due date' },
  { key: 'book_link', label: 'Booking link' },
  { key: 'phone', label: 'Garage phone' },
  { key: 'garage', label: 'Garage name' },
];

export const DEFAULT_MESSAGES: Record<ReminderKind, string> = {
  mot: [
    '*MOT reminder*',
    '',
    'Hi {name}, this is {garage}.',
    '',
    'The MOT on your {vehicle} *{reg}* {due} *{date}*.',
    '',
    'Book online in under a minute: {book_link}',
    'Or just reply to this message, or call us on {phone}.',
    '',
    'Thank you,',
    '{garage}',
  ].join('\n'),
  service: [
    '*Service reminder*',
    '',
    'Hi {name}, this is {garage}.',
    '',
    'Your {vehicle} *{reg}* is due its service around *{date}*. Regular servicing keeps it safe, reliable and protects its value.',
    '',
    'Book online in under a minute: {book_link}',
    'Or just reply to this message, or call us on {phone}.',
    '',
    'Thank you,',
    '{garage}',
  ].join('\n'),
  advisory: [
    'Hi {name}, this is {garage}.',
    '',
    'At its last MOT your {vehicle} *{reg}* had some advisories worth sorting before they become a problem:',
    '{advisories}',
    '',
    'Would you like a quote? Just reply to this message or call us on {phone}.',
    '',
    'Thank you,',
    '{garage}',
  ].join('\n'),
};

/** Fill in a message: unknown fill-ins are left as typed, lines with an empty fill-in are dropped */
export function renderMessage(template: string, vars: Record<string, string | null | undefined>) {
  const lines = template.replace(/\r/g, '').split('\n').flatMap((line) => {
    let empty = false;
    const out = line.replace(/\{([a-z_]+)\}/g, (all, key: string) => {
      if (!(key in vars)) return all;
      const v = vars[key]?.trim();
      if (!v) empty = true;
      return v ?? '';
    });
    return empty ? [] : [out.trimEnd()];
  });
  // no double blank lines, none at the start or end
  return lines.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim();
}

const shortDate = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`));

/** Short message for WhatsApp / text, in the garage's own wording if it has set one */
export function reminderMessage(c: Ctx & { template?: string | null }) {
  const advisories = c.advisories?.length ? c.advisories.slice(0, 3).map((a) => `• ${a}`).join('\n') : null;
  return renderMessage(c.template?.trim() || DEFAULT_MESSAGES[c.kind], {
    name: c.firstName || 'there',
    garage: c.garage,
    vehicle: c.make || 'vehicle',
    reg: prettyReg(c.registration),
    date: c.due ? shortDate(c.due) : null,
    due: c.overdue ? 'ran out on' : 'is due on',
    book_link: c.bookUrl ? `${c.bookUrl}${c.bookUrl.includes('?') ? '&' : '?'}reg=${encodeURIComponent(c.registration)}` : null,
    phone: c.phone,
    advisories,
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Email for automatic MOT / service reminders */
export function reminderEmail(c: Ctx & { unsubscribeUrl: string; brand?: string | null }) {
  const brand = c.brand && /^#[0-9a-fA-F]{6}$/.test(c.brand) ? c.brand : '#1A5BA6';
  const what = c.kind === 'mot' ? 'MOT' : 'service';
  const subject = `${what} reminder for ${prettyReg(c.registration)}`;
  const line = c.kind === 'mot'
    ? `The MOT on your ${car(c)} is due on <b>${ukDate(c.due)}</b>.`
    : `Your ${car(c)} is due a service around <b>${ukDate(c.due)}</b>.`;
  const text = [
    `Hi ${c.firstName || 'there'},`, '',
    line.replace(/<\/?b>/g, ''),
    c.bookUrl ? `Book online: ${c.bookUrl}` : '',
    c.phone ? `Or call us on ${c.phone}.` : '', '',
    `Thanks,`, c.garage, '', `Stop these reminders: ${c.unsubscribeUrl}`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.5;max-width:520px">
    <p>Hi ${esc(c.firstName || 'there')},</p>
    <p>${line.replace(car(c), esc(car(c)))}</p>
    ${c.bookUrl ? `<p><a href="${c.bookUrl}" style="display:inline-block;background:${brand};color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Book online</a></p>` : ''}
    ${c.phone ? `<p>Or call us on <b>${esc(c.phone)}</b>.</p>` : ''}
    <p>Thanks,<br>${esc(c.garage)}</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">You're receiving this because you asked ${esc(c.garage)} for MOT and service reminders.
      <a href="${c.unsubscribeUrl}" style="color:#94a3b8">Stop these reminders</a>.</p></div>`;
  return { subject, text, html };
}
