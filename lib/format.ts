import { waNumber } from './phone';

export const gbp = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

/** 12 Mar 2026 */
export const ukDate = (d?: string | null) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(d.length === 10 ? `${d}T12:00:00Z` : d)) : '—';

export const miles = (n?: number | null) => (n == null ? '—' : `${n.toLocaleString('en-GB')} mi`);

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** Mobile number → WhatsApp chat link (07… → 447…); null for landlines, which aren't on WhatsApp */
export const whatsappLink = (phone?: string | null) => {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}` : null;
};
