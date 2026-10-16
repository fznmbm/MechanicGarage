import { PRODUCT_NAME } from '@/lib/brand';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ThemeProvider } from '@/components/theme-provider';
import { BrandStyle } from '@/components/brand-style';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getTenant } from '@/lib/tenant';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const name = (await getTenant())?.name ?? PRODUCT_NAME;
  return { title: { default: name, template: `%s · ${name}` } };
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
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
