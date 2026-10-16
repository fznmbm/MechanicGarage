import Link from 'next/link';
import { Plus, Search, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RegPlate } from '@/components/reg-plate';
import { MotBadge } from '@/components/mot-badge';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { miles } from '@/lib/format';
import { normaliseReg } from '@/lib/reg';
import { ukDatePlus, ukToday } from '@/lib/time';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Vehicles' };
const PAGE_SIZE = 25;

type Row = {
  id: string; registration: string; make: string | null; model: string | null; colour: string | null;
  mot_due: string | null; last_mileage: number | null; customer: { id: string; name: string } | null;
};

const FILTERS = [
  { key: '', label: 'All vehicles' },
  { key: '30', label: 'MOT due in 30 days' },
  { key: 'overdue', label: 'MOT expired' },
];

export default async function VehiclesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; mot?: string; page?: string }> }) {
  const m = (await getMembership())!;
  const { q = '', mot = '', page: p = '1' } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const sb = await createClient();

  const term = q.trim().replace(/[%,()*\\]/g, ' ').slice(0, 50);
  const reg = normaliseReg(term);

  let query = sb
    .from('vehicles')
    .select('id, registration, make, model, colour, mot_due, last_mileage, customer:customers(id, name)', { count: 'exact' })
    .eq('garage_id', m.garage_id);

  if (term) {
    // Match registration, make/model, or the owner's name
    const { data: owners } = await sb.from('customers').select('id')
      .eq('garage_id', m.garage_id).ilike('name', `%${term}%`).limit(100);
    const ors = [`make.ilike.%${term}%`, `model.ilike.%${term}%`];
    if (reg) ors.unshift(`registration.ilike.%${reg}%`);
    if (owners?.length) ors.push(`customer_id.in.(${owners.map((o) => o.id).join(',')})`);
    query = query.or(ors.join(','));
  }

  const today = ukToday();
  if (mot === '30') query = query.gte('mot_due', today).lte('mot_due', ukDatePlus(30)).order('mot_due');
  else if (mot === 'overdue') query = query.lt('mot_due', today).order('mot_due', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];

  const qs = (extra: Record<string, string>) =>
    `/vehicles?${new URLSearchParams(Object.fromEntries(Object.entries({ q, mot, ...extra }).filter(([, v]) => v)))}`;

  // Exact registration searched but not on file: offer to add it
  const offerAdd = reg.length >= 2 && !rows.some((r) => r.registration === reg);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Vehicles"
        description="Every vehicle on file, with MOT status."
        actions={<Button asChild><Link href="/vehicles/new"><Plus /> Add vehicle</Link></Button>}
      />

      <Card className="gap-0 py-0">
        <div className="space-y-3 border-b p-3">
          <form suppressHydrationWarning className="flex gap-2">
            {mot && <input suppressHydrationWarning type="hidden" name="mot" value={mot} />}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Search registration, make, model or owner" className="pl-8" />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link key={f.key} href={qs({ mot: f.key, page: '' })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  mot === f.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                )}>
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {offerAdd && term && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <RegPlate reg={reg} /> isn&apos;t on file yet.
            </span>
            <Button size="sm" asChild><Link href={`/vehicles/new?reg=${reg}`}><Plus /> Look it up and add</Link></Button>
          </div>
        )}

        {rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Registration</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead>MOT</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Mileage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => (
                  <TableRow key={v.id} className="relative">
                    <TableCell>
                      <Link href={`/vehicles/${v.id}`} className="after:absolute after:inset-0">
                        <RegPlate reg={v.registration} className="text-sm" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</div>
                      {v.colour && <div className="text-xs text-muted-foreground">{v.colour}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {v.customer ? (
                        <Link href={`/customers/${v.customer.id}`} className="relative z-10 hover:underline">{v.customer.name}</Link>
                      ) : (
                        <span className="text-muted-foreground">No owner</span>
                      )}
                    </TableCell>
                    <TableCell><MotBadge due={v.mot_due} /></TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{miles(v.last_mileage)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(n) => qs({ page: String(n) })} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Car className="size-6" /></span>
            <div>
              <p className="font-medium">
                {q || mot ? 'No vehicles match' : 'No vehicles yet'}
              </p>
              <p className="text-sm text-muted-foreground">
                {q || mot ? 'Try a different search or filter.' : 'Enter a registration and we’ll fill in the details.'}
              </p>
            </div>
            <div className="flex gap-2">
              {(q || mot) && <Button variant="outline" asChild><Link href="/vehicles">Clear filters</Link></Button>}
              <Button asChild><Link href="/vehicles/new"><Plus /> Add vehicle</Link></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
