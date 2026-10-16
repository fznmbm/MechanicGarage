import { ukToday, ukDatePlus } from './time';

export type MotState = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export function motState(due?: string | null): MotState {
  if (!due) return 'unknown';
  if (due < ukToday()) return 'overdue';
  if (due <= ukDatePlus(30)) return 'due_soon';
  return 'ok';
}

export const MOT_STYLE: Record<MotState, { label: string; className: string }> = {
  overdue:  { label: 'MOT expired', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  due_soon: { label: 'MOT due soon', className: 'border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning' },
  ok:       { label: 'MOT valid', className: 'border-success/30 bg-success/10 text-success' },
  unknown:  { label: 'MOT unknown', className: 'text-muted-foreground' },
};

export const DEFECT_STYLE: Record<string, { label: string; className: string; rank: number }> = {
  DANGEROUS:     { label: 'Dangerous', className: 'bg-destructive text-white', rank: 0 },
  MAJOR:         { label: 'Major', className: 'bg-destructive/15 text-destructive', rank: 1 },
  FAIL:          { label: 'Fail', className: 'bg-destructive/15 text-destructive', rank: 1 },
  PRS:           { label: 'Repaired at test', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400', rank: 2 },
  MINOR:         { label: 'Minor', className: 'bg-warning/20 text-warning-foreground dark:text-warning', rank: 3 },
  ADVISORY:      { label: 'Advisory', className: 'bg-muted text-muted-foreground', rank: 4 },
  'USER ENTERED':{ label: 'Note', className: 'bg-muted text-muted-foreground', rank: 5 },
};
