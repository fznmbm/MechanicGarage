import { siteBrand } from '@/lib/site-brand';

/** Web app manifest: lets each garage's address be installed as its own app with its own name and icon */
export async function GET() {
  const b = await siteBrand();
  const icon = (size: number, purpose: 'any' | 'maskable') => ({
    src: `/brand/icon?size=${size}${purpose === 'maskable' ? '&maskable=1' : ''}&v=${b.version}`,
    sizes: `${size}x${size}`, type: 'image/png', purpose,
  });
  const manifest = {
    id: '/',
    name: b.name,
    short_name: b.shortName,
    description: b.garage ? `${b.name}: diary, job cards, invoices and reminders` : 'Garage management for UK repair and MOT garages',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: b.colour,
    lang: 'en-GB',
    categories: ['business', 'productivity'],
    icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
    shortcuts: [
      { name: 'Diary', url: '/diary', icons: [icon(192, 'any')] },
      { name: 'Job cards', url: '/jobs', icons: [icon(192, 'any')] },
      { name: 'Reminders', url: '/reminders', icons: [icon(192, 'any')] },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
