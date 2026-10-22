import { gbp } from '@/lib/format';

/** Daily takings: one series, so one colour, no legend. Hover a bar for the exact figure. */
export function TakingsChart({ days }: { days: { day: string; taken: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.taken));
  const nice = (n: number) => { const p = 10 ** Math.floor(Math.log10(n)); return Math.ceil(n / p) * p; };
  const top = nice(max);
  const label = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const every = Math.ceil(days.length / 8);

  return (
    <figure>
      <div className="flex gap-2">
        <div className="flex h-48 flex-col justify-between py-0 text-right text-[11px] text-muted-foreground tabular-nums">
          <span>{gbp(top).replace('.00', '')}</span><span>{gbp(top / 2).replace('.00', '')}</span><span>£0</span>
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-48 flex-col justify-between">
            <div className="border-t border-dashed" /><div className="border-t border-dashed" /><div className="border-t" />
          </div>
          <div className="relative flex h-48 items-end gap-[2px]">
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0}
                aria-label={`${label(d.day)}: ${gbp(d.taken)}`}>
                <div className="w-full max-w-8 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                  style={{ height: `${(d.taken / top) * 100}%`, minHeight: d.taken > 0 ? 2 : 0 }} />
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block group-focus:block">
                  <div className="text-muted-foreground">{label(d.day)}</div>
                  <div className="font-semibold tabular-nums">{gbp(d.taken)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[11px] text-muted-foreground">
            {days.map((d, i) => (
              <div key={d.day} className="flex-1 overflow-visible text-center whitespace-nowrap">{i % every === 0 ? label(d.day) : ''}</div>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">View as a table</summary>
        <table className="mt-2 w-full max-w-xs text-xs">
          <thead><tr className="text-muted-foreground"><th className="py-1 text-left font-medium">Day</th><th className="py-1 text-right font-medium">Taken</th></tr></thead>
          <tbody>
            {days.filter((d) => d.taken > 0).map((d) => (
              <tr key={d.day} className="border-t"><td className="py-1">{label(d.day)}</td><td className="py-1 text-right tabular-nums">{gbp(d.taken)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
