'use client';

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { adjustStock, savePart, saveSupplier } from './actions';

export type Supplier = { id: string; name: string; phone: string | null; email: string | null; account_ref: string | null };
export type Part = {
  id: string; part_number: string; name: string; supplier_id: string | null; cost_pence: number | null; sell_pence: number;
  stock_qty: number; min_qty: number; location: string | null;
};
const pounds = (p?: number | null) => (p == null ? '' : (p / 100).toFixed(2));

export function PartForm({ part, suppliers, onDone }: { part?: Part; suppliers: Supplier[]; onDone?: () => void }) {
  const { formAction, pending, err } = useActionToast(savePart);
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-4">
      {part && <input suppressHydrationWarning type="hidden" name="id" value={part.id} />}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Part number" htmlFor="part_number" error={err('part_number')}>
          <Input id="part_number" name="part_number" defaultValue={part?.part_number ?? ''} className="font-mono uppercase" aria-invalid={!!err('part_number')} />
        </Field>
        <Field label="Name" htmlFor="name" error={err('name')} className="sm:col-span-3">
          <Input id="name" name="name" defaultValue={part?.name ?? ''} placeholder="e.g. Front brake pad set" aria-invalid={!!err('name')} />
        </Field>
        <Field label="Cost £" htmlFor="cost" error={err('cost')}>
          <Input id="cost" name="cost" inputMode="decimal" defaultValue={pounds(part?.cost_pence)} placeholder="0.00" />
        </Field>
        <Field label="Sell price £" htmlFor="sell" error={err('sell')}>
          <Input id="sell" name="sell" inputMode="decimal" defaultValue={pounds(part?.sell_pence)} placeholder="0.00" />
        </Field>
        {!part && (
          <Field label="In stock now" htmlFor="stock_qty" error={err('stock_qty')}>
            <Input id="stock_qty" name="stock_qty" type="number" step="0.01" min="0" defaultValue={0} />
          </Field>
        )}
        <Field label="Reorder at" htmlFor="min_qty" error={err('min_qty')} hint="Flags low stock">
          <Input id="min_qty" name="min_qty" type="number" step="0.01" min="0" defaultValue={part?.min_qty ?? 0} />
        </Field>
        <Field label="Supplier" htmlFor="supplier_id" className="sm:col-span-2">
          <NativeSelect id="supplier_id" name="supplier_id" defaultValue={part?.supplier_id ?? ''}>
            <option value="">None</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Shelf / location" htmlFor="location" className="sm:col-span-2">
          <Input id="location" name="location" defaultValue={part?.location ?? ''} placeholder="e.g. Rack B, shelf 3" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{part ? 'Save part' : 'Add part'}</Button>
      </div>
    </form>
  );
}

export function NewPart({ suppliers }: { suppliers: Supplier[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}><Plus /> Add part</Button>;
  return (
    <div className="w-full rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium">New part</span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X /> Close</Button>
      </div>
      <PartForm suppliers={suppliers} onDone={() => setOpen(false)} />
    </div>
  );
}

export function StockForm({ id }: { id: string }) {
  const { formAction, pending, err, state } = useActionToast(adjustStock);
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'f'} className="space-y-3">
      <input suppressHydrationWarning type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Change" htmlFor="mode">
          <NativeSelect id="mode" name="mode" defaultValue="delivery">
            <option value="delivery">Delivery (add)</option>
            <option value="remove">Remove</option>
            <option value="set">Stock-take (set to)</option>
          </NativeSelect>
        </Field>
        <Field label="Quantity" htmlFor="qty" error={err('qty')}>
          <Input id="qty" name="qty" type="number" step="0.01" min="0" aria-invalid={!!err('qty')} />
        </Field>
      </div>
      <Field label="Note" htmlFor="note" optional>
        <Input id="note" name="note" placeholder="e.g. Invoice 48213" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Update stock</Button>
    </form>
  );
}

export function SupplierForm() {
  const { formAction, pending, err, state } = useActionToast(saveSupplier);
  return (
    <form suppressHydrationWarning action={formAction} key={state.ok ? state.ts : 'f'} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1.5fr_1fr_auto] sm:items-end">
      <Field label="Supplier" htmlFor="s_name" error={err('name')}><Input id="s_name" name="name" placeholder="e.g. Euro Car Parts" /></Field>
      <Field label="Phone" htmlFor="s_phone"><Input id="s_phone" name="phone" type="tel" /></Field>
      <Field label="Email" htmlFor="s_email"><Input id="s_email" name="email" type="email" /></Field>
      <Field label="Account no." htmlFor="s_acc"><Input id="s_acc" name="account_ref" /></Field>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />} Add</Button>
    </form>
  );
}
