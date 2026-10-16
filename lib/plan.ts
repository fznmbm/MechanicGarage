export type PlanInfo = { plan_status: string; trial_ends_at: string | null };

export type PlanState =
  | { kind: 'ok' }
  | { kind: 'trial'; daysLeft: number }
  | { kind: 'trial_ended' }
  | { kind: 'past_due' }
  | { kind: 'cancelled' };

/** What to show the garage about its subscription. `now` is passed in so this stays pure. */
export function planState(p: PlanInfo, now: number): PlanState {
  if (p.plan_status === 'active' || p.plan_status === 'comped') return { kind: 'ok' };
  if (p.plan_status === 'past_due') return { kind: 'past_due' };
  if (p.plan_status === 'cancelled') return { kind: 'cancelled' };
  if (!p.trial_ends_at) return { kind: 'trial', daysLeft: 14 };
  const ms = new Date(p.trial_ends_at).getTime() - now;
  return ms <= 0 ? { kind: 'trial_ended' } : { kind: 'trial', daysLeft: Math.ceil(ms / 86_400_000) };
}

export const PLAN_LABEL: Record<string, string> = {
  trial: 'Free trial', active: 'Subscribed', past_due: 'Payment overdue', cancelled: 'Cancelled', comped: 'Free plan',
};
