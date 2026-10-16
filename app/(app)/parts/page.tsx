import Link from 'next/link';
import { Search, Boxes, Phone, Mail, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { deleteSupplier } from './actions';
import { NewPart, SupplierForm, type Part, type Supplier } from './part-forms';

export const metadata = { title: 'Parts & stock' };

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; low?: string }> }) {
  const m = (await getMembership())!;
  const { q = '', tab = 'parts', low } = await searchParams;
  const staff = m.role !== 'mechanic';
  const sb = await createClient();
  const term = q.trim().replace(/[%,()*\\]/g, ' ').slice(0, 40);

  let query = sb.from('parts').select('id, part_number, name, supplier_id, cost_pence, sell_pence, stock_qty, min_qty, location')
    .eq('garage_id', m.garage_id).eq('active', true).order('name').limit(300);
  if (term) query = query.or(`name.ilike.%${term}%,part_number.ilike.%${term}%`);
  const [{ data: partsData }, { data: suppliersData }] = await Promise.all([
    query,
    sb.from('suppliers').select('id, name, phone, email, account_ref').eq('garage_id', m.garage_id).order('name'),
  ]);
  const suppliers = (suppliersData ?? []) as Supplier[];
  const all = ((partsData ?? []) as Part[]).map((p) => ({ ...p, stock_qty: Number(p.stock_qty), min_qty: Number(p.min_qty) }));
  const isLow = (p: Part) => p.stock_qty <= p.min_qty && (p.min_qty > 0 || p.stock_qty < 0);
  const lowCount = all.filter(isLow).length;
  const parts = low ? all.filter(isLow) : all;
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const stockValue = all.reduce((s, p) => s + Math.max(0, p.stock_qty) * (p.cost_pence ?? 0), 0);

  const pill = (active: boolean) => cn('rounded-full border px-3 py-1 text-xs font-medium', active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Parts & stock"
        description={staff ? `${all.length} parts · stock worth ${gbp(Math.round(stockValue))} at cost` : `${all.length} parts`} />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href="/parts" className={pill(tab === 'parts' && !low)}>All parts</Link>
        <Link href="/parts?low=1" className={pill(!!low)}>Low stock{lowCount ? ` (${lowCount})` : ''}</Link>
        <Link href="/parts?tab=suppliers" className={pill(tab === 'suppliers')}>Suppliers</Link>
      </div>

      {tab === 'suppliers' ? (
        <Card>
          <CardHeader className="border-b"><CardTitle>Suppliers</CardTitle><CardDescription>Who you buy parts from.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {suppliers.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {suppliers.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-40 flex-1 font-medium">{s.name}{s.account_ref && <span className="ml-2 font-normal text-muted-foreground">Acc {s.account_ref}</span>}</span>
                    {s.phone && <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Phone className="size-3.5" />{s.phone}</a>}
                    {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Mail className="size-3.5" />{s.email}</a>}
                    {staff && (
                      <form suppressHydrationWarning action={deleteSupplier}>
                        <input suppressHydrationWarning type="hidden" name="id" value={s.id} />
                        <Button type="submit" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Delete supplier"><Trash2 className="size-3.5" /></Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {staff ? <SupplierForm /> : suppliers.length === 0 && <p className="text-sm text-muted-foreground">No suppliers yet.</p>}
          </CardContent>
        </Card>
      ) : (
        <>
          {staff && <NewPart suppliers={suppliers} />}
          <Card className="gap-0 py-0">
            <form suppressHydrationWarning className="flex gap-2 border-b p-3">
              {low && <input suppressHydrationWarning type="hidden" name="low" value="1" />}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={q} placeholder="Search part name or number" className="pl-8" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            {parts.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Part</TableHead>
                    <TableHead className="hidden md:table-cell">Supplier</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    {staff && <TableHead className="hidden text-right sm:table-cell">Cost</TableHead>}
                    <TableHead className="text-right">Sell</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((p) => (
                    <TableRow key={p.id} className="relative">
                      <TableCell>
                        <Link href={`/parts/${p.id}`} className="after:absolute after:inset-0">
                          <div className="font-medium">{p.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{p.part_number}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{p.supplier_id ? supplierName.get(p.supplier_id) ?? '—' : '—'}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{p.location ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {isLow(p)
                          ? <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive"><AlertTriangle /> {p.stock_qty}</Badge>
                          : <span className="tabular-nums">{p.stock_qty}</span>}
                      </TableCell>
                      {staff && <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{p.cost_pence != null ? gbp(p.cost_pence) : '—'}</TableCell>}
                      <TableCell className="text-right tabular-nums">{gbp(p.sell_pence)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Boxes className="size-6" /></span>
                <p className="font-medium">{low ? 'Nothing is running low' : q ? 'No parts match' : 'No parts yet'}</p>
                <p className="text-sm text-muted-foreground">
                  {low || q ? 'Try a different search.' : 'Add the parts you keep in stock. Using one on a job takes it out of stock automatically.'}
                </p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
