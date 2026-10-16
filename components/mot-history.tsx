import { CheckCircle2, XCircle, Gauge, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFECT_STYLE } from '@/lib/mot';
import { ukDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MotDefect, MotTest } from '@/lib/vehicle-lookup';

const sortDefects = (d: MotDefect[]) =>
  [...d].sort((a, b) => (DEFECT_STYLE[a.type]?.rank ?? 9) - (DEFECT_STYLE[b.type]?.rank ?? 9));

export function DefectList({ defects }: { defects: MotDefect[] }) {
  if (!defects.length) return null;
  return (
    <ul className="space-y-1.5">
      {sortDefects(defects).map((d, i) => {
        const s = DEFECT_STYLE[d.dangerous ? 'DANGEROUS' : d.type] ?? DEFECT_STYLE.ADVISORY;
        return (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', s.className)}>
              {s.label}
            </span>
            <span className="leading-snug">{d.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function MotHistory({ tests }: { tests: MotTest[] }) {
  return (
    <ol className="relative space-y-6 border-l pl-6">
      {tests.map((t, i) => {
        const passed = t.result === 'PASSED';
        return (
          <li key={t.testNumber ?? `${t.completedDate}-${i}`} className="relative">
            <span className={cn(
              'absolute top-0.5 -left-[33px] flex size-5 items-center justify-center rounded-full bg-background',
              passed ? 'text-success' : 'text-destructive'
            )}>
              {passed ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{ukDate(t.completedDate)}</span>
              <Badge variant="outline" className={passed ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'}>
                {passed ? 'Pass' : 'Fail'}
              </Badge>
              {t.odometer != null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Gauge className="size-3.5" /> {t.odometer.toLocaleString('en-GB')} {t.odometerUnit ?? 'mi'}
                </span>
              )}
              {t.expiryDate && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" /> Expires {ukDate(t.expiryDate)}
                </span>
              )}
            </div>
            {t.defects.length > 0 && <div className="mt-2"><DefectList defects={t.defects} /></div>}
          </li>
        );
      })}
    </ol>
  );
}
