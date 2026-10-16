import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { FlashToast } from '@/components/flash-toast';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';
import { gbp, ukDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { archivePart } from '../actions';
import { PartForm, StockForm, type Part, type Supplier } from '../part-forms';

export const metadata = { title: 'Part' };
const REASON: Record<string, string> = { job: 'Used on job', delivery: 'Delivery', adjustment: 'Adjustment', return: 'Returned to stock' };

export default async function PartPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const m = (await getMembership())!;
  const staff = m.role !== 'mechanic';
  const sb = await createClient();
  const [{ data: p }, { data: suppliers }, { data: moves }] = await Promise.all([
    sb.from('parts').select('*').eq('id', id).eq('garage_id', m.garage_id).maybeSingle(),
    sb.from('suppliers').select('id, name, phone, email, account_ref').eq('garage_id', m.garage_id).order('name'),
    sb.from('stock_movements').select('id, qty_change, reason, note, job_id, created_at').eq('part_id', id).order('created_at', { ascending: false }).limit(30),
  ]);
  if (!p) notFound();
  const part = { ...p, stock_qty: Number(p.stock_qty), min_qty: Number(p.min_qty) } as Part;
  const low = part.stock_qty <= part.min_qty && (part.min_qty > 0 || part.stock_qty < 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <FlashToast message={created ? 'Part added' : null} />
      <PageHeader title={part.name}
        description={<span className="flex items-center gap-2"><span className="font-mono">{part.part_number}</span>
          <Badge variant="outline" className={cn(low && 'border-destructive/30 bg-destructive/10 text-destructive')}>{part.stock_qty} in stock{low ? ' · low' : ''}</Badge>
          {staff && part.cost_pence != null && part.sell_pence > 0 && <span>Margin {gbp(part.sell_pence - part.cost_pence)} each</span>}</span>}>
        <Link href="/parts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Parts</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {staff && (
            <Card>
              <CardHeader className="border-b"><CardTitle>Details</CardTitle></CardHeader>
              <CardContent><PartForm part={part} suppliers={(suppliers ?? []) as Supplier[]} /></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Stock history</CardTitle><CardDescription>Last 30 changes</CardDescription></CardHeader>
            <CardContent>
              {moves?.length ? (
                <ul className="divide-y text-sm">
                  {moves.map((mv) => (
                    <li key={mv.id} className="flex items-center gap-3 py-2">
                      <span className={cn('w-14 text-right font-medium tabular-nums', Number(mv.qty_change) < 0 ? 'text-destructive' : 'text-success')}>
                        {Number(mv.qty_change) > 0 ? '+' : ''}{Number(mv.qty_change)}
                      </span>
                      <span className="flex-1">
                        {mv.job_id ? <Link href={`/jobs/${mv.job_id}`} className="hover:underline">{REASON[mv.reason]}</Link> : REASON[mv.reason]}
                        {mv.note && <span className="text-muted-foreground"> · {mv.note}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{ukDate(mv.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No stock changes yet.</p>}
            </CardContent>
          </Card>
        </div>
        {staff && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Update stock</CardTitle><CardDescription>Book in a delivery or correct the count.</CardDescription></CardHeader>
              <CardContent><StockForm id={part.id} /></CardContent>
            </Card>
            <form suppressHydrationWarning action={archivePart}>
              <input suppressHydrationWarning type="hidden" name="id" value={part.id} />
              <ConfirmSubmit variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                message={`Remove ${part.name} from the parts list? Past jobs keep their record of it.`}>
                <Archive /> Remove part
              </ConfirmSubmit>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
