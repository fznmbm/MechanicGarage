import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, Receipt, AlertCircle, Wallet, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate } from '@/lib/format';
import { STATUS_STYLE, balance, displayStatus, type InvoiceRow } from '@/lib/invoice';
import { ukToday } from '@/lib/time';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Invoices' };
const PAGE_SIZE = 25;

type Row = Pick<InvoiceRow, 'id' | 'number' | 'issued_at' | 'due_at' | 'total_pence' | 'paid_pence' | 'credited_pence' | 'status' | 'buyer' | 'vehicle'>;
type CreditRow = Pick<InvoiceRow, 'id' | 'number' | 'issued_at' | 'total_pence' | 'buyer' | 'vehicle'> & { reason: string; invoice: { id: string; number: string } | null };

const TABS = [
  { key: '', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
  { key: 'credits', label: 'Credit notes' },
];

export default async function InvoicesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; tab?: string; page?: string }> }) {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/');
  const { q = '', tab = '', page: p = '1' } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const today = ukToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const sb = await createClient();

  let query = sb.from('invoices')
    .select('id, number, issued_at, due_at, total_pence, paid_pence, credited_pence, status, buyer, vehicle', { count: 'exact' })
    .eq('garage_id', m.garage_id)
    .order('issued_at', { ascending: false }).order('number', { ascending: false });
  if (tab === 'unpaid') query = query.in('status', ['issued', 'part_paid']);
  if (tab === 'overdue') query = query.in('status', ['issued', 'part_paid']).lt('due_at', today);
  if (tab === 'paid') query = query.eq('status', 'paid');
  if (tab === 'void') query = query.eq('status', 'void');
  const term = q.trim().replace(/[%,()*\\"]/g, ' ').slice(0, 40);
  if (term) {
    query = query.or(`number.ilike.%${term}%,buyer->>name.ilike.%${term}%,vehicle->>registration.ilike.%${term.toUpperCase().replace(/\s/g, '')}%`);
  }

  let credits = sb.from('credit_notes')
    .select('id, number, issued_at, total_pence, reason, buyer, vehicle, invoice:invoices(id, number)', { count: 'exact' })
    .eq('garage_id', m.garage_id).order('issued_at', { ascending: false }).order('number', { ascending: false });
  if (term) credits = credits.or(`number.ilike.%${term}%,buyer->>name.ilike.%${term}%,vehicle->>registration.ilike.%${term.toUpperCase().replace(/\s/g, '')}%`);

  const [{ data, count }, { data: open }, { data: payments }] = await Promise.all([
    (tab === 'credits' ? credits : query).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    sb.from('invoices').select('total_pence, paid_pence, credited_pence, status, due_at').eq('garage_id', m.garage_id).in('status', ['issued', 'part_paid']),
    sb.from('payments').select('amount_pence').eq('garage_id', m.garage_id).gte('paid_at', `${monthStart}T00:00:00Z`),
  ]);
  const rows = (tab === 'credits' ? [] : data ?? []) as Row[];
  const creditRows = (tab === 'credits' ? data ?? [] : []) as unknown as CreditRow[];
  const outstanding = (open ?? []).reduce((s, i) => s + balance(i as Row), 0);
  const overdue = (open ?? []).filter((i) => i.due_at && i.due_at < today).reduce((s, i) => s + balance(i as Row), 0);
  const taken = (payments ?? []).reduce((s, x) => s + x.amount_pence, 0);

  const qs = (extra: Record<string, string>) =>
    `/invoices?${new URLSearchParams(Object.fromEntries(Object.entries({ q, tab, ...extra }).filter(([, v]) => v)))}`;

  const kpis = [
    { label: 'Outstanding', value: gbp(outstanding), sub: `${open?.length ?? 0} unpaid invoice${open?.length === 1 ? '' : 's'}`, icon: Wallet, href: qs({ tab: 'unpaid', page: '' }) },
    { label: 'Overdue', value: gbp(overdue), sub: 'Past their due date', icon: AlertCircle, href: qs({ tab: 'overdue', page: '' }), warn: overdue > 0 },
    { label: 'Taken this month', value: gbp(taken), sub: 'Payments recorded', icon: CheckCircle2, href: qs({ tab: 'paid', page: '' }) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Invoices" description="Invoices are created from job cards." />

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}>
            <Card className="gap-1 transition-colors hover:border-primary/40">
              <CardHeader>
                <CardDescription className="flex items-center gap-2"><k.icon className="size-4" />{k.label}</CardDescription>
                <CardTitle className={cn('text-2xl tabular-nums', k.warn && 'text-destructive')}>{k.value}</CardTitle>
                <CardDescription className="text-xs">{k.sub}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <div className="space-y-3 border-b p-3">
          <form suppressHydrationWarning className="flex gap-2">
            {tab && <input suppressHydrationWarning type="hidden" name="tab" value={tab} />}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Search invoice number, customer or registration" className="pl-8" />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <Link key={t.key} href={qs({ tab: t.key, page: '' })}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium', tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {tab === 'credits' && creditRows.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Credit note</TableHead>
                  <TableHead className="hidden sm:table-cell">Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Against</TableHead>
                  <TableHead className="hidden lg:table-cell">Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditRows.map((r) => (
                  <TableRow key={r.id} className="relative">
                    <TableCell>
                      <Link href={`/invoices/credit/${r.id}`} className="after:absolute after:inset-0">
                        <div className="font-mono text-sm font-medium">{r.number}</div>
                        <div className="text-xs text-muted-foreground">{ukDate(r.issued_at)}</div>
                        <div className="max-w-40 truncate text-xs sm:hidden">{r.buyer?.name}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate sm:table-cell">{r.buyer?.name ?? '—'}</TableCell>
                    <TableCell className="hidden font-mono text-sm md:table-cell">{r.invoice?.number}</TableCell>
                    <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell">{r.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">−{gbp(r.total_pence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(n) => qs({ page: String(n) })} />
          </>
        )}
        {tab === 'credits' && creditRows.length > 0 ? null : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Vehicle</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const ds = displayStatus(r, today);
                  return (
                    <TableRow key={r.id} className="relative">
                      <TableCell>
                        <Link href={`/invoices/${r.id}`} className="after:absolute after:inset-0">
                          <div className="font-mono text-sm font-medium">{r.number}</div>
                          <div className="text-xs text-muted-foreground">{ukDate(r.issued_at)}</div>
                          <div className="max-w-40 truncate text-xs sm:hidden">{r.buyer?.name}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden max-w-48 truncate sm:table-cell">{r.buyer?.name ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell">{r.vehicle?.registration && <RegPlate reg={r.vehicle.registration} />}</TableCell>
                      <TableCell className="text-right tabular-nums">{gbp(r.total_pence)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{ds === 'void' || ds === 'credited' ? '—' : gbp(balance(r))}</TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_STYLE[ds].className}>{STATUS_STYLE[ds].label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(n) => qs({ page: String(n) })} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Receipt className="size-6" /></span>
            <div>
              <p className="font-medium">{tab === 'credits' ? 'No credit notes' : q || tab ? 'No invoices match' : 'No invoices yet'}</p>
              <p className="text-sm text-muted-foreground">
                {tab === 'credits' ? 'Credit notes are issued from an invoice, to refund or correct it.' : 'Open a job card and choose “Create invoice” when the work is done.'}
              </p>
            </div>
            {(q || tab) && <Button variant="outline" asChild><Link href="/invoices">Clear filters</Link></Button>}
          </div>
        )}
      </Card>
    </div>
  );
}
