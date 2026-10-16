import { cn } from '@/lib/utils';

// UK-style yellow registration plate badge
export function RegPlate({ reg, className }: { reg?: string | null; className?: string }) {
  if (!reg) return null;
  const r = reg.replace(/\s/g, '').toUpperCase();
  const pretty = r.length > 4 ? `${r.slice(0, -3)} ${r.slice(-3)}` : r;
  return (
    <span className={cn(
      'inline-flex items-center rounded-[4px] border border-black/25 bg-[#F7D117] px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-black shadow-sm',
      className
    )}>
      {pretty}
    </span>
  );
}
