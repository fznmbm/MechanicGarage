import 'server-only';
import type { Metadata } from 'next';
import { siteOrigin } from './url';
import { siteBrand } from './site-brand';

/**
 * Link-preview details (WhatsApp, Facebook, Google, texts) for a page.
 * Private links (invoices, estimates…) pass a generic title so nothing personal shows in the preview.
 */
export async function shareMeta(o: { title?: string; description?: string; image?: 'book'; path?: string } = {}): Promise<Metadata> {
  const [b, origin] = await Promise.all([siteBrand(), siteOrigin()]);
  const title = o.title ?? b.name;
  const description = o.description ?? (b.garage
    ? `MOT, servicing and repairs${b.town ? ` in ${b.town}` : ''}${b.phone ? ` · ${b.phone}` : ''}`
    : 'Garage management for UK repair and MOT garages: diary, job cards, invoices and reminders.');
  const image = `${origin}/brand/og?v=${b.version}${o.image === 'book' ? '&for=book' : ''}`;
  return {
    description,
    openGraph: {
      type: 'website', locale: 'en_GB', siteName: b.name, title, description, url: `${origin}${o.path ?? ''}`,
      images: [{ url: image, width: 1200, height: 630, alt: b.name }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/** Private links (invoice, estimate, approval…): the preview names the garage but nothing about the customer or amount */
export async function privateMeta(title: string, what: string, description = 'Tap to open. Only people with this link can see it.'): Promise<Metadata> {
  const b = await siteBrand();
  return {
    title,
    robots: { index: false, follow: false },
    ...(await shareMeta({ title: b.garage ? `${what} from ${b.name}` : what, description })),
  };
}
