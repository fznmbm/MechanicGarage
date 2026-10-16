import { Badge } from '@/components/ui/badge';
import { ukDate } from '@/lib/format';
import { MOT_STYLE, motState } from '@/lib/mot';
import { cn } from '@/lib/utils';

export function MotBadge({ due, showDate = true, className }: { due?: string | null; showDate?: boolean; className?: string }) {
  const s = motState(due);
  const style = MOT_STYLE[s];
  return (
    <Badge variant="outline" className={cn(style.className, className)}>
      {s === 'unknown' ? 'No MOT date' : showDate ? `${s === 'overdue' ? 'Expired' : 'Due'} ${ukDate(due)}` : style.label}
    </Badge>
  );
}
