import 'server-only';
import { headers } from 'next/headers';

/** Absolute origin of the current request, e.g. https://smiths.ironbay.co.uk */
export async function siteOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || /^\d/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
