import { PRODUCT_NAME } from '@/lib/brand';
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ThemeProvider } from '@/components/theme-provider';
import { BrandStyle } from '@/components/brand-style';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getTenant } from '@/lib/tenant';
import { siteBrand } from '@/lib/site-brand';
import { shareMeta } from '@/lib/og';
import { Pwa } from '@/components/pwa';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const b = await siteBrand();
  const name = b.name ?? PRODUCT_NAME;
  const v = b.version;
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    manifest: `/brand/manifest?v=${v}`,
    icons: {
      icon: [{ url: `/brand/icon?size=32&v=${v}`, sizes: '32x32', type: 'image/png' }, { url: `/brand/icon?size=192&v=${v}`, sizes: '192x192', type: 'image/png' }],
      apple: [{ url: `/brand/icon?size=180&v=${v}`, sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: { capable: true, title: b.shortName, statusBarStyle: 'default' },
    formatDetection: { telephone: false },
    ...(await shareMeta()),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await siteBrand();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: b.colour },
      { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <BrandStyle colour={tenant?.brand_colour} />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
            <Pwa />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
