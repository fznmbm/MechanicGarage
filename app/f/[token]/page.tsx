import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PRODUCT_NAME, safeColour } from '@/lib/brand';
import { FeedbackForm } from './feedback-form';

export const metadata = { title: 'How did we do?', robots: { index: false, follow: false } };

type Page = {
  garage: { name: string; logo_url: string | null; brand_colour: string | null; phone: string | null; google_review_url: string | null };
  vehicle: { registration: string; make: string | null; model: string | null } | null;
  first_name: string | null; score: number | null; answered: boolean;
};

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const sb = await createClient();
  const { data } = await sb.rpc('feedback_page', { p_token: token });
  const p = data as Page | null;
  if (!p) notFound();
  const brand = safeColour(p.garage.brand_colour) ?? '#1A5BA6';

  return (
    <div className="min-h-svh bg-slate-100 px-4 py-10" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-md space-y-4">
        <div className="space-y-5 rounded-2xl bg-white p-6 text-slate-900 shadow-sm">
          <div className="flex items-center gap-3">
            {p.garage.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.garage.logo_url} alt="" className="size-12 rounded-lg object-contain" />
            )}
            <div className="font-semibold">{p.garage.name}</div>
          </div>
          <FeedbackForm token={token} brand={brand} firstName={p.first_name} answered={p.answered} initialScore={p.score}
            car={p.vehicle ? [p.vehicle.make, p.vehicle.model].filter(Boolean).join(' ') || p.vehicle.registration : null}
            reviewUrl={p.garage.google_review_url} garage={p.garage.name} />
        </div>
        <p className="text-center text-xs text-slate-400">Powered by {PRODUCT_NAME}</p>
      </div>
    </div>
  );
}
