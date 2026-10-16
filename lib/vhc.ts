// Vehicle health check template (red / amber / green)

export const VHC_TEMPLATE: { category: string; items: string[] }[] = [
  { category: 'Tyres', items: ['Front left tyre', 'Front right tyre', 'Rear left tyre', 'Rear right tyre', 'Spare / inflation kit'] },
  { category: 'Brakes', items: ['Front brake pads and discs', 'Rear brake pads / shoes', 'Brake fluid', 'Handbrake'] },
  { category: 'Lights & visibility', items: ['Headlights and indicators', 'Brake and rear lights', 'Wiper blades', 'Windscreen and washers'] },
  { category: 'Under the bonnet', items: ['Engine oil level and condition', 'Coolant', 'Battery', 'Drive belts', 'Leaks'] },
  { category: 'Steering & suspension', items: ['Steering', 'Shock absorbers and springs', 'Suspension bushes and joints'] },
  { category: 'Underside', items: ['Exhaust', 'Driveshafts and gaiters', 'Corrosion'] },
];

export type CheckStatus = 'unchecked' | 'green' | 'amber' | 'red' | 'na';

export const CHECK_STYLE: Record<CheckStatus, { label: string; short: string; dot: string; on: string }> = {
  green: { label: 'OK', short: 'OK', dot: 'bg-success', on: 'border-success bg-success text-white' },
  amber: { label: 'Needs attention soon', short: 'Soon', dot: 'bg-warning', on: 'border-warning bg-warning text-warning-foreground' },
  red: { label: 'Needs attention now', short: 'Now', dot: 'bg-destructive', on: 'border-destructive bg-destructive text-white' },
  na: { label: 'Not checked', short: 'N/A', dot: 'bg-muted-foreground/40', on: 'border-muted-foreground bg-muted text-foreground' },
  unchecked: { label: 'To check', short: '—', dot: 'bg-muted-foreground/20', on: '' },
};
