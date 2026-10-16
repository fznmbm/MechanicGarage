import { PRODUCT_NAME } from '@/lib/brand';
import { headers } from 'next/headers';
import { MapPin, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { GarageLogo } from '@/components/garage-logo';
import { BrandStyle } from '@/components/brand-style';
import { ThemeToggle } from '@/components/theme-toggle';
import { createClient } from '@/lib/supabase/server';
import { ukToday } from '@/lib/time';
import { BookingWizard, type BookingGarage, type BookingService } from './booking-wizard';

type Page = {
  garage: BookingGarage & { slug: string; logo_url: string | null; brand_colour: string | null; address: string | null; postcode: string | null; enabled: boolean };
  services: BookingService[];
};

async function load(): Promise<Page | null> {
  const h = await headers();
  const slug = h.get('x-garage-slug');
  const host = h.get('x-garage-host');
  if (!slug && !host) return null;
  const sb = await createClient();
  const { data } = await sb.rpc('booking_page', { p_slug: slug, p_host: host });
  return (data as Page | null) ?? null;
}

export async function generateMetadata() {
  const page = await load();
  return { title: page ? `Book online · ${page.garage.name}` : 'Book online' };
}

export default async function BookPage() {
  const page = await load();
  const g = page?.garage;

  return (
    <div className="min-h-svh bg-muted/40 px-4 py-6 sm:py-10">
      <BrandStyle colour={g?.brand_colour} />
      <div className="mx-auto max-w-xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GarageLogo name={g?.name ?? 'Garage'} logoUrl={g?.logo_url} className="size-11 text-base" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">{g?.name ?? 'Book online'}</h1>
              {g && (
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  {(g.address || g.postcode) && <span className="flex items-center gap-1"><MapPin className="size-3" />{[g.address?.split('\n')[0], g.postcode].filter(Boolean).join(', ')}</span>}
                  {g.phone && <a href={`tel:${g.phone.replace(/\s/g, '')}`} className="flex items-center gap-1"><Phone className="size-3" />{g.phone}</a>}
                </p>
              )}
            </div>
          </div>
          <ThemeToggle />
        </header>

        <Card>
          <CardContent>
            {!g ? (
              <p className="py-8 text-center text-sm text-muted-foreground">We couldn’t find this garage. Check the link and try again.</p>
            ) : !g.enabled || page!.services.length === 0 ? (
              <div className="space-y-2 py-8 text-center">
                <p className="font-medium">Online booking isn’t available right now</p>
                {g.phone && <p className="text-sm text-muted-foreground">Please call us on <a className="font-medium text-foreground underline" href={`tel:${g.phone.replace(/\s/g, '')}`}>{g.phone}</a> to book.</p>}
              </div>
            ) : (
              <>
                {g.message && <p className="mb-5 rounded-lg bg-primary/5 p-3 text-sm">{g.message}</p>}
                <BookingWizard garage={g} services={page!.services} today={ukToday()} />
              </>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">Powered by {PRODUCT_NAME}</p>
      </div>
    </div>
  );
}
