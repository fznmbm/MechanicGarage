export const gbp = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

/** 12 Mar 2026 */
export const ukDate = (d?: string | null) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(d.length === 10 ? `${d}T12:00:00Z` : d)) : '—';

export const miles = (n?: number | null) => (n == null ? '—' : `${n.toLocaleString('en-GB')} mi`);

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** UK number → WhatsApp link (07… → 447…) */
export const whatsappLink = (phone?: string | null) => {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = `44${d.slice(1)}`;
  return d.length >= 11 ? `https://wa.me/${d}` : null;
};
