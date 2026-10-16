import Link from 'next/link';
import { Plus, Search, Users, Phone, Mail, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RegPlate } from '@/components/reg-plate';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { initials, ukDate } from '@/lib/format';

export const metadata = { title: 'Customers' };
const PAGE_SIZE = 25;

type Row = {
  id: string; name: string; phone: string | null; email: string | null; postcode: string | null; created_at: string;
  vehicles: { id: string; registration: string }[];
};

export default async function CustomersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const m = (await getMembership())!;
  const { q = '', page: p = '1' } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const term = q.trim().replace(/[%,()*\\]/g, ' ').slice(0, 50);

  const sb = await createClient();
  let query = sb
    .from('customers')
    .select('id, name, phone, email, postcode, created_at, vehicles(id, registration)', { count: 'exact' })
    .eq('garage_id', m.garage_id)
    .order('name')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,postcode.ilike.%${term}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as Row[];

  const href = (n: number) => `/customers?${new URLSearchParams({ ...(q && { q }), page: String(n) })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has brought a vehicle to the garage."
        actions={<>
          {m.role !== 'mechanic' && <Button variant="outline" asChild><Link href="/customers/import"><Upload /> Import</Link></Button>}
          <Button asChild><Link href="/customers/new"><Plus /> New customer</Link></Button>
        </>}
      />

      <Card className="gap-0 py-0">
        <form suppressHydrationWarning className="flex gap-2 border-b p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search by name, phone, email or postcode" className="pl-8" />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead>Vehicles</TableHead>
                  <TableHead className="hidden lg:table-cell">Postcode</TableHead>
                  <TableHead className="hidden lg:table-cell">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="relative">
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(c.name)}
                        </span>
                        <span className="font-medium">{c.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {c.phone && <span className="flex items-center gap-1.5"><Phone className="size-3" />{c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1.5"><Mail className="size-3" />{c.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {c.vehicles.slice(0, 3).map((v) => <RegPlate key={v.id} reg={v.registration} />)}
                        {c.vehicles.length > 3 && <span className="text-xs text-muted-foreground">+{c.vehicles.length - 3}</span>}
                        {c.vehicles.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{c.postcode ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{ukDate(c.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={href} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="size-6" /></span>
            <div>
              <p className="font-medium">{q ? `No customers match “${q}”` : 'No customers yet'}</p>
              <p className="text-sm text-muted-foreground">
                {q ? 'Try a different name, number or postcode.' : 'Add your first customer, or start from a vehicle registration.'}
              </p>
            </div>
            <div className="flex gap-2">
              {q && <Button variant="outline" asChild><Link href="/customers">Clear search</Link></Button>}
              {!q && m.role !== 'mechanic' && <Button variant="outline" asChild><Link href="/customers/import"><Upload /> Import from a spreadsheet</Link></Button>}
              <Button asChild><Link href="/customers/new"><Plus /> New customer</Link></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
