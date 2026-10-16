export const JOB_FLOW = ['checked_in', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'complete', 'collected'] as const;
export type JobStatusKey = (typeof JOB_FLOW)[number];

export const jobNo = (n: number) => `J${String(n).padStart(4, '0')}`;

export const JOB_BADGE: Record<string, string> = {
  checked_in: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  in_progress: 'border-primary/30 bg-primary/10 text-primary',
  awaiting_parts: 'border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning',
  awaiting_approval: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400',
  complete: 'border-success/30 bg-success/10 text-success',
  collected: 'text-muted-foreground',
};

export const minutesLabel = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

/** Wording the customer signs at check-in, unless the garage sets its own */
export const DEFAULT_AUTHORISATION =
  'I authorise the work described above and any further work I agree to. I accept the garage’s terms. Payment is due on collection.';
