'use client';
import { useEffect, useState, useTransition } from 'react';
import { Search, UserPlus, X, Loader2, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CustomerFields } from '@/components/customer-fields';
import { initials } from '@/lib/format';
import { searchCustomers, type CustomerHit } from '@/app/(app)/customers/actions';

type Selected = { id: string; name: string; sub?: string | null };

/**
 * Pick the vehicle's owner: an existing customer, a new one, or nobody.
 * Posts customer_mode (existing|new|none), customer_id, and new_* fields.
 */
export function CustomerPicker({
  initial, err,
}: { initial?: Selected | null; err: (k: string) => string | undefined }) {
  const [mode, setMode] = useState<'existing' | 'new' | 'none'>(initial ? 'existing' : 'none');
  const [selected, setSelected] = useState<Selected | null>(initial ?? null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => startSearch(async () => setHits(await searchCustomers(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  const shownHits = q.trim().length < 2 ? [] : hits;

  return (
    <div className="space-y-3">
      <input suppressHydrationWarning type="hidden" name="customer_mode" value={mode} />
      <input suppressHydrationWarning type="hidden" name="customer_id" value={mode === 'existing' ? selected?.id ?? '' : ''} />

      {mode === 'existing' && selected ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(selected.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{selected.name}</div>
            {selected.sub && <div className="truncate text-xs text-muted-foreground">{selected.sub}</div>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected(null); setMode('none'); }}>
            <X /> Change
          </Button>
        </div>
      ) : mode === 'new' ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">New customer</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode('none')}>
              <X /> Cancel
            </Button>
          </div>
          <CustomerFields prefix="new_" err={err} compact />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name, phone or postcode"
              className="pl-8" aria-label="Search customers" />
            {searching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {shownHits.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {shownHits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                    onClick={() => {
                      setSelected({ id: h.id, name: h.name, sub: [h.phone, h.postcode].filter(Boolean).join(' · ') });
                      setMode('existing');
                      setQ('');
                    }}>
                    <User className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm font-medium">{h.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{[h.phone, h.postcode].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !searching && shownHits.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">No customers match &ldquo;{q}&rdquo;.</p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setMode('new')}>
            <UserPlus /> Add a new customer
          </Button>
        </div>
      )}
    </div>
  );
}
