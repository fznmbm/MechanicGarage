import Link from 'next/link';
import { Phone, CalendarPlus, Check } from 'lucide-react';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { gbp, ukDate, whatsappLink } from '@/lib/format';
import { addDays, ukToday } from '@/lib/time';
import { prettyReg } from '@/lib/reg';
import { markDeclinedFollowedUp } from './actions';

type Row = {
  id: string; description: string; quantity: number; unit_price_pence: number;
  job: { id: string; created_at: string; vehicle: { id: string; registration: string; make: string | null } | null;
    customer: { id: string; name: string; phone: string | null } | null } | null;
};

/** Work the customer said no to on the approval link, oldest first, from the last 12 months */
export async function DeclinedWork({ garageId, garageName, bookUrl }: { garageId: string; garageName: string; bookUrl: string | null }) {
  const sb = await createClient();
  const { data } = await sb.from('job_lines')
    .select('id, description, quantity, unit_price_pence, job:jobs!inner(id, created_at, vehicle:vehicles(id, registration, make), customer:customers(id, name, phone))')
    .eq('garage_id', garageId).eq('approval', 'declined').is('followed_up_at', null)
    .gte('job.created_at', `${addDays(ukToday(), -365)}T00:00:00Z`)
    .limit(300);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.job?.customer);

  // one entry per job, with all its declined items
  const byJob = new Map<string, { job: NonNullable<Row['job']>; items: Row[] }>();
  for (const r of rows) {
    const k = r.job!.id;
    if (!byJob.has(k)) byJob.set(k, { job: r.job!, items: [] });
    byJob.get(k)!.items.push(r);
  }
  const groups = [...byJob.values()].sort((a, b) => a.job.created_at.localeCompare(b.job.created_at));

  if (!groups.length) {
    return (
      <Card className="py-16 text-center">
        <p className="font-medium">Nothing to follow up</p>
        <p className="text-sm text-muted-foreground">Work customers decline on the approval link appears here, so you can offer it again.</p>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y">
        {groups.map(({ job, items }) => {
          const value = items.reduce((s, l) => s + Math.round(Number(l.quantity) * l.unit_price_pence), 0);
          const first = job.customer!.name.split(' ')[0];
          const car = job.vehicle ? `${job.vehicle.make ? `${job.vehicle.make} ` : ''}${prettyReg(job.vehicle.registration)}` : 'car';
          const msg = `Hi ${first}, it's ${garageName}. When your ${car} was in on ${ukDate(job.created_at)} we recommended: ` +
            `${items.map((i) => i.description).slice(0, 3).join('; ')}. Would you like us to book that in?${bookUrl ? ` ${bookUrl}` : ''}`;
          const wa = whatsappLink(job.customer!.phone);
          return (
            <li key={job.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              {job.vehicle && <RegPlate reg={job.vehicle.registration} />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm">
                  <Link href={`/customers/${job.customer!.id}`} className="font-medium hover:underline">{job.customer!.name}</Link>
                  <span className="text-muted-foreground"> · declined {ukDate(job.created_at)} · {gbp(value)} before VAT</span>
                </div>
                <ul className="text-sm text-muted-foreground">
                  {items.map((i) => <li key={i.id}>• {i.description}</li>)}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {wa && <Button size="sm" variant="whatsapp" asChild><a href={`${wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><WhatsAppIcon className="size-4" /> WhatsApp</a></Button>}
                {job.customer!.phone && <Button size="sm" variant="outline" asChild><a href={`tel:${job.customer!.phone.replace(/\s/g, '')}`}><Phone /> Call</a></Button>}
                {job.vehicle && <Button size="sm" variant="outline" asChild><Link href={`/diary/new?vehicle=${job.vehicle.id}`}><CalendarPlus /> Book in</Link></Button>}
                <form suppressHydrationWarning action={markDeclinedFollowedUp}>
                  {items.map((i) => <input key={i.id} type="hidden" name="line_id" value={i.id} />)}
                  <Button type="submit" size="sm" variant="ghost"><Check /> Done</Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
