'use client';

import { useState, useTransition } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { gbp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { respond } from './actions';

export type ApprovalLine = {
  id: string; type: string; description: string; quantity: number | string; unit_price_pence: number; no_vat: boolean;
  approval: 'pending' | 'approved' | 'declined';
};

export function ApprovalList({ token, lines, vatRate, locked }: { token: string; lines: ApprovalLine[]; vatRate: number | null; locked: boolean }) {
  const [local, setLocal] = useState(lines);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  // price the customer pays, including VAT where it applies
  const price = (l: ApprovalLine) => {
    const net = Math.round(Number(l.quantity) * l.unit_price_pence);
    return vatRate && !l.no_vat ? net + Math.round((net * vatRate) / 100) : net;
  };
  const sum = (status: string) => local.filter((l) => l.approval === status).reduce((s, l) => s + price(l), 0);

  const choose = (l: ApprovalLine, decision: 'approved' | 'declined') => {
    setBusy(l.id);
    start(async () => {
      const res = await respond(token, l.id, decision);
      setBusy(null);
      if (!res.ok) return void toast.error(res.error ?? 'Something went wrong. Please call us.');
      setLocal((all) => all.map((x) => (x.id === l.id ? { ...x, approval: decision } : x)));
    });
  };

  const pending = local.filter((l) => l.approval === 'pending').length;

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {local.map((l) => (
          <li key={l.id} className={cn('rounded-xl border p-4 transition',
            l.approval === 'approved' && 'border-success/40 bg-success/5', l.approval === 'declined' && 'opacity-70')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={cn('font-medium', l.approval === 'declined' && 'line-through')}>{l.description}</div>
                <div className="text-xs text-muted-foreground capitalize">{l.type}{Number(l.quantity) !== 1 ? ` · ${Number(l.quantity)}${l.type === 'labour' ? ' hrs' : ''}` : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums">{l.unit_price_pence > 0 ? gbp(price(l)) : 'Price to confirm'}</div>
                {vatRate && !l.no_vat && l.unit_price_pence > 0 && <div className="text-xs text-muted-foreground">inc. VAT</div>}
              </div>
            </div>
            {!locked && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant={l.approval === 'approved' ? 'default' : 'outline'} disabled={busy === l.id}
                  className={cn(l.approval === 'approved' && 'bg-success text-success-foreground hover:bg-success/90')} onClick={() => choose(l, 'approved')}>
                  {busy === l.id ? <Loader2 className="animate-spin" /> : <Check />} {l.approval === 'approved' ? 'Approved' : 'Approve'}
                </Button>
                <Button variant={l.approval === 'declined' ? 'secondary' : 'outline'} disabled={busy === l.id} onClick={() => choose(l, 'declined')}>
                  <X /> {l.approval === 'declined' ? 'Declined' : 'Not now'}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-muted/60 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Approved extra work</span><span className="font-semibold tabular-nums">{gbp(sum('approved'))}</span></div>
        {pending > 0 && <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Still to decide ({pending})</span><span className="tabular-nums">{gbp(sum('pending'))}</span></div>}
        {!locked && pending === 0 && <p className="mt-2 font-medium text-success">Thanks! We’ve let the workshop know.</p>}
      </div>
    </div>
  );
}
