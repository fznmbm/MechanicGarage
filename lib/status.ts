export const JOB_STATUS = {
  checked_in:        { label: 'Checked in',        dot: 'bg-sky-500' },
  in_progress:       { label: 'In progress',       dot: 'bg-primary' },
  awaiting_parts:    { label: 'Awaiting parts',    dot: 'bg-warning' },
  awaiting_approval: { label: 'Awaiting approval', dot: 'bg-violet-500' },
  complete:          { label: 'Ready to collect',  dot: 'bg-success' },
  collected:         { label: 'Collected',         dot: 'bg-muted-foreground' },
} as const;
export type JobStatus = keyof typeof JOB_STATUS;

export const BOOKING_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  booked:    { label: 'Booked',    variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'secondary' },
  arrived:   { label: 'Arrived',   variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show:   { label: 'No-show',   variant: 'destructive' },
};
