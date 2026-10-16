import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Search, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate } from '@/lib/format';
import { totals, vatRateOn } from '@/lib/money';
import { ESTIMATE_STATUS, estimateDisplay, type EstimateStatus } from '@/lib/invoice';
import { ukToday } from '@/lib/time';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Estimates' };
const PAGE_SIZE = 25;

type Row = {
  id: string; number: string; issued_at: string; valid_until: string | null; status: EstimateStatus; title: string | null; viewed_at: string | null;
  customer: { name: string } | null; vehicle: { registration: string } | null;
  lines: { quantity: number; unit_price_pence: number; no_vat: boolean; optional: boolean; accepted: boolean }[];
};

const TABS = [
  { key: '', label: 'All' }, { key: 'draft', label: 'Drafts' }, { key: 'sent', label: 'Waiting for customer' },
  { key: 'accepted', label: 'Accepted' }, { key: 'declined', label: 'Declined' }, { key: 'converted', label: 'Job created' },
];

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { q = '', tab = '', page: p = '1' } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const today = ukToday();
  const sb = await createClient();

  let query = sb.from('estimates')
    .select('id, number, issued_at, valid_until, status, title, viewed_at, customer:customers(name), vehicle:vehicles(registration), lines:estimate_lines(quantity, unit_price_pence, no_vat, optional, accepted)', { count: 'exact' })
    .eq('garage_id', m.garage_id).order('created_at', { ascending: false });
  if (TABS.some((t) => t.key && t.key === tab)) query = query.eq('status', tab);
  const term = q.trim().replace(/[%,()*\\"]/g, ' ').slice(0, 40);
  if (term) query = query.or(`number.ilike.%${term}%,title.ilike.%${term}%`);

  const [{ data, count }, { data: g }, { count: accepted }] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    sb.from('garages').select('vat_registered, vat_effective_from, default_vat_rate').eq('id', m.garage_id).single(),
    sb.from('estimates').select('id', { count: 'exact', head: true }).eq('garage_id', m.garage_id).eq('status', 'accepted'),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const qs = (extra: Record<string, string>) => `/estimates?${new URLSearchParams(Object.fromEntries(Object.entries({ q, tab, ...extra }).filter(([, v]) => v)))}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Estimates" description="Quotes for customers to accept online. Accepted estimates become job cards in one click."
        actions={<Button asChild><Link href="/estimates/new"><Plus /> New estimate</Link></Button>} />

      <Card className="gap-0 py-0">
        <div className="space-y-3 border-b p-3">
          <form suppressHydrationWarning className="flex gap-2">
            {tab && <input type="hidden" name="tab" value={tab} />}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Search estimate number or heading" className="pl-8" />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <Link key={t.key} href={qs({ tab: t.key, page: '' })}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium', tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                {t.label}{t.key === 'accepted' && accepted ? ` (${accepted})` : ''}
              </Link>
            ))}
          </div>
        </div>

        {rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Estimate</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Vehicle</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const ds = estimateDisplay(r, today);
                  const t = totals(r.lines.filter((l) => !l.optional || l.accepted), g ? vatRateOn(g, r.issued_at) : null);
                  return (
                    <TableRow key={r.id} className="relative">
                      <TableCell>
                        <Link href={`/estimates/${r.id}`} className="after:absolute after:inset-0">
                          <div className="font-mono text-sm font-medium">{r.number}</div>
                          <div className="max-w-56 truncate text-xs text-muted-foreground">{ukDate(r.issued_at)}{r.title ? ` · ${r.title}` : ''}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{r.customer?.name ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell">{r.vehicle && <RegPlate reg={r.vehicle.registration} />}</TableCell>
                      <TableCell className="text-right tabular-nums">{gbp(t.gross)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ESTIMATE_STATUS[ds].className}>{ESTIMATE_STATUS[ds].label}</Badge>
                        {r.status === 'sent' && r.viewed_at && <span className="ml-2 text-xs text-muted-foreground">opened</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(n) => qs({ page: String(n) })} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSignature className="size-6" /></span>
            <div>
              <p className="font-medium">{q || tab ? 'No estimates match' : 'No estimates yet'}</p>
              <p className="text-sm text-muted-foreground">Price up work, send the customer a link, and turn it into a job when they accept.</p>
            </div>
            <Button asChild><Link href="/estimates/new"><Plus /> New estimate</Link></Button>
          </div>
        )}
      </Card>
    </div>
  );
}
