'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/field';
import { VehiclePicker, type PickedVehicle } from '@/components/vehicle-picker';
import { useActionToast } from '@/components/use-action-toast';
import { gbp } from '@/lib/format';
import { parsePounds, totals } from '@/lib/money';
import type { MenuItem } from '@/lib/types';
import { saveEstimate, type EstimateLineInput } from './actions';

type Draft = { type: EstimateLineInput['type']; description: string; quantity: string; price: string; no_vat: boolean; optional: boolean; part_number: string };
const toDraft = (l: EstimateLineInput): Draft => ({
  type: l.type, description: l.description, quantity: String(l.quantity), price: (l.unit_price_pence / 100).toFixed(2),
  no_vat: l.no_vat, optional: l.optional, part_number: l.part_number ?? '',
});
const blank = (type: Draft['type'], labourRate: number): Draft => ({
  type, description: '', quantity: '1', price: type === 'labour' && labourRate ? (labourRate / 100).toFixed(2) : '', no_vat: false, optional: false, part_number: '',
});

export type EstimateFormProps = {
  id?: string;
  vehicle: PickedVehicle | null;
  title?: string | null; notes?: string | null; validUntil: string;
  lines?: EstimateLineInput[];
  labourRate: number; vatRate: number | null; lookupEnabled: boolean; menu: MenuItem[];
};

export function EstimateForm(p: EstimateFormProps) {
  const { formAction, pending, err } = useActionToast(saveEstimate);
  const [lines, setLines] = useState<Draft[]>(p.lines?.length ? p.lines.map(toDraft) : [blank('labour', p.labourRate)]);
  const [menuPick, setMenuPick] = useState('');
  const set = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const parsed = lines.map((l) => ({
    type: l.type, description: l.description, quantity: Number(l.quantity) || 1, unit_price_pence: parsePounds(l.price) ?? 0,
    no_vat: l.no_vat, optional: l.optional, part_number: l.part_number || null,
  }));
  const main = totals(parsed.filter((l) => !l.optional), p.vatRate);
  const extras = totals(parsed.filter((l) => l.optional), p.vatRate);

  const addMenu = () => {
    const item = p.menu.find((m) => m.id === menuPick);
    if (!item) return;
    setLines((ls) => [...ls.filter((l) => l.description.trim()), ...item.lines.map((l) => ({
      type: l.type, description: l.description, quantity: String(l.quantity), price: (l.unit_price_pence / 100).toFixed(2),
      no_vat: !!l.no_vat, optional: false, part_number: '',
    }))]);
    setMenuPick('');
  };

  return (
    <form suppressHydrationWarning action={formAction} className="space-y-6">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(parsed)} />

      <Card>
        <CardHeader className="border-b"><CardTitle>Vehicle and customer</CardTitle></CardHeader>
        <CardContent><VehiclePicker initial={p.vehicle} lookupEnabled={p.lookupEnabled} err={err} /></CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Work and prices</CardTitle>
          <CardDescription>Mark extras as optional: the customer can tick the ones they want when accepting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Heading" htmlFor="title" error={err('title')} optional hint="Shown at the top, e.g. “Front brakes and service”.">
            <Input id="title" name="title" defaultValue={p.title ?? ''} maxLength={120} />
          </Field>

          <div className="space-y-2">
            <div className="hidden grid-cols-[6.5rem_1fr_6rem_4.5rem_6rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
              <span>Type</span><span>Description</span><span>Part no.</span><span>Qty / hrs</span><span>Price £</span><span />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[6.5rem_1fr] gap-2 rounded-md border bg-muted/20 p-2 md:grid-cols-[6.5rem_1fr_6rem_4.5rem_6rem_2rem] md:border-0 md:bg-transparent md:p-0">
                <NativeSelect value={l.type} onChange={(e) => set(i, { type: e.target.value as Draft['type'] })} aria-label="Type" className="h-8">
                  <option value="labour">Labour</option><option value="part">Part</option><option value="fee">Fee</option>
                </NativeSelect>
                <Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Description" className="h-8" aria-label="Description" />
                <Input value={l.part_number} onChange={(e) => set(i, { part_number: e.target.value })} placeholder="—" className="h-8" aria-label="Part number" disabled={l.type !== 'part'} />
                <Input value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" className="h-8 text-right" aria-label="Quantity" />
                <Input value={l.price} onChange={(e) => set(i, { price: e.target.value })} inputMode="decimal" placeholder="0.00" className="h-8 text-right" aria-label="Unit price" />
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Remove line"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
                <div className="col-span-full flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground md:col-start-2">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={l.optional} onChange={(e) => set(i, { optional: e.target.checked })} className="size-3.5 accent-primary" /> Optional extra
                  </label>
                  {p.vatRate != null && (
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={l.no_vat} onChange={(e) => set(i, { no_vat: e.target.checked })} className="size-3.5 accent-primary" /> No VAT (e.g. MOT fee)
                    </label>
                  )}
                </div>
              </div>
            ))}
            {err('lines') && <p className="text-xs text-destructive">{err('lines')}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank('labour', p.labourRate)])}><Plus /> Labour</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank('part', p.labourRate)])}><Plus /> Part</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, blank('fee', p.labourRate)])}><Plus /> Fee</Button>
            {p.menu.length > 0 && (
              <div className="flex gap-2">
                <NativeSelect value={menuPick} onChange={(e) => setMenuPick(e.target.value)} aria-label="Service menu" className="h-8 w-52">
                  <option value="">From the service menu…</option>
                  {p.menu.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </NativeSelect>
                <Button type="button" size="sm" variant="secondary" onClick={addMenu} disabled={!menuPick}><ListChecks /> Add</Button>
              </div>
            )}
          </div>

          <dl className="ml-auto w-full max-w-72 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Net</dt><dd className="tabular-nums">{gbp(main.net)}</dd></div>
            {p.vatRate != null && <div className="flex justify-between"><dt className="text-muted-foreground">VAT {p.vatRate}%</dt><dd className="tabular-nums">{gbp(main.vat)}</dd></div>}
            <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{gbp(main.gross)}</dd></div>
            {extras.gross > 0 && <div className="flex justify-between text-muted-foreground"><dt>Optional extras</dt><dd className="tabular-nums">+{gbp(extras.gross)}</dd></div>}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field label="Valid until" htmlFor="valid_until" error={err('valid_until')}>
            <Input id="valid_until" name="valid_until" type="date" defaultValue={p.validUntil} />
          </Field>
          <Field label="Note to the customer" htmlFor="notes" optional>
            <Textarea id="notes" name="notes" rows={2} defaultValue={p.notes ?? ''} placeholder="e.g. Parts can be ordered for next-day fitting." />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{p.id ? 'Save estimate' : 'Create estimate'}</Button>
      </div>
    </form>
  );
}
