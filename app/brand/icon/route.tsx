import { ImageResponse } from 'next/og';
import { imageFonts, logoData, siteBrand } from '@/lib/site-brand';

const SIZES = [32, 180, 192, 512];

/**
 * App icon in the garage's colours: its logo on a white tile, or its initials.
 * ?size=32|180|192|512, &maskable=1 keeps everything inside the safe zone Android crops to.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = SIZES.includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : 192;
  const maskable = url.searchParams.get('maskable') === '1';
  const [b, fonts] = await Promise.all([siteBrand(), imageFonts()]);
  const logo = size >= 180 ? await logoData(b.logoUrl) : null;
  // Android masks may crop to a circle: keep the content in the middle 60%
  const inner = Math.round(size * (maskable ? 0.6 : size === 32 ? 1 : 0.72));
  const rounded = !maskable && size !== 180; // iOS rounds its own icons

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Geist',
        background: b.colour, borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}>
        {logo ? (
          <div style={{
            width: inner, height: inner, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#ffffff', borderRadius: Math.round(inner * 0.2),
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={logo} width={Math.round(inner * 0.8)} height={Math.round(inner * 0.8)} style={{ objectFit: 'contain' }} />
          </div>
        ) : (
          <div style={{
            display: 'flex', color: b.fg, fontWeight: 700, letterSpacing: '-0.02em',
            fontSize: Math.round(inner * (b.initials.length > 1 ? 0.5 : 0.62)),
          }}>
            {b.initials}
          </div>
        )}
      </div>
    ),
    { width: size, height: size, fonts, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } },
  );
}
