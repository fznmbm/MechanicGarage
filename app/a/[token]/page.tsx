import { PRODUCT_NAME } from '@/lib/brand';
import { privateMeta } from '@/lib/og';
import { notFound } from 'next/navigation';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GarageLogo } from '@/components/garage-logo';
import { BrandStyle } from '@/components/brand-style';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { adminConfigured, createAdminClient } from '@/lib/supabase/admin';
import { CHECK_STYLE, type CheckStatus } from '@/lib/vhc';
import { cn } from '@/lib/utils';
import { ApprovalList, type ApprovalLine } from './approval-list';

export const generateMetadata = () => privateMeta('Approve work on your vehicle', 'Work to approve',
  'Tap to see the photos and prices, and approve online. Only people with this link can see it.');

type Doc = {
  garage: { name: string; phone: string | null; email: string | null; logo_url: string | null; brand_colour: string | null; vat_rate: number | string | null };
  job: { id: string; number: number; status: string; locked: boolean };
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  customer: string | null;
  lines: ApprovalLine[];
  checks: { item: string; category: string; status: CheckStatus; note: string | null }[];
  photos: string[];
};

export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const sb = await createClient();
  const { data } = await sb.rpc('approval_doc', { p_token: token });
  const doc = data as Doc | null;
  if (!doc) notFound();

  // job photos are private: sign short-lived links when the service key is available
  let photos: string[] = [];
  if (doc.photos.length && adminConfigured()) {
    const { data: signed } = await createAdminClient().storage.from('job-photos').createSignedUrls(doc.photos.slice(0, 12), 3600);
    photos = (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[];
  }

  const g = doc.garage;
  const attention = doc.checks.filter((c) => c.status === 'red' || c.status === 'amber');
  const ok = doc.checks.filter((c) => c.status === 'green').length;

  return (
    <div className="min-h-svh bg-muted/40 px-4 py-6 sm:py-10">
      <BrandStyle colour={g.brand_colour} />
      <div className="mx-auto max-w-xl space-y-4">
        <header className="flex items-center gap-3">
          <GarageLogo name={g.name} logoUrl={g.logo_url} className="size-11 text-base" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">{g.name}</h1>
            {doc.vehicle && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RegPlate reg={doc.vehicle.registration} /> {[doc.vehicle.make, doc.vehicle.model].filter(Boolean).join(' ')}
              </p>
            )}
          </div>
          {g.phone && <Button variant="outline" size="sm" asChild><a href={`tel:${g.phone.replace(/\s/g, '')}`}><Phone /> Call us</a></Button>}
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{doc.customer ? `Hi ${doc.customer}, ` : ''}we recommend some extra work</CardTitle>
            <p className="text-sm text-muted-foreground">
              {doc.job.locked ? 'This job is now complete. Call us with any questions.' : 'Nothing below will be done unless you approve it. Tap to choose.'}
            </p>
          </CardHeader>
          <CardContent>
            {doc.lines.length ? (
              <ApprovalList token={token} lines={doc.lines} vatRate={g.vat_rate == null ? null : Number(g.vat_rate)} locked={doc.job.locked} />
            ) : (
              <p className="text-sm text-muted-foreground">There’s nothing waiting for your approval.</p>
            )}
          </CardContent>
        </Card>

        {doc.checks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Vehicle health check</CardTitle>
              <p className="text-sm text-muted-foreground">{attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'} need attention` : 'Everything we checked is fine'} · {ok} OK</p>
            </CardHeader>
            {attention.length > 0 && (
              <CardContent>
                <ul className="space-y-2">
                  {attention.map((c) => (
                    <li key={c.item} className="flex items-start gap-3 text-sm">
                      <span className={cn('mt-1 size-3 shrink-0 rounded-full', CHECK_STYLE[c.status].dot)} />
                      <div>
                        <div className="font-medium">{c.item} <span className="font-normal text-muted-foreground">· {CHECK_STYLE[c.status].label}</span></div>
                        {c.note && <div className="text-muted-foreground">{c.note}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        )}

        {photos.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Photos from the workshop</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="Photo of your vehicle" className="size-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <p className="text-center text-xs text-muted-foreground">Powered by {PRODUCT_NAME}</p>
      </div>
    </div>
  );
}
