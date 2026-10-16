// Standard booking types with default durations (minutes) and diary colours

export const SERVICE_TYPES = [
  { name: 'MOT', minutes: 60, colour: 'border-l-sky-500 bg-sky-500/10' },
  { name: 'MOT + service', minutes: 180, colour: 'border-l-sky-500 bg-sky-500/10' },
  { name: 'Full service', minutes: 150, colour: 'border-l-emerald-500 bg-emerald-500/10' },
  { name: 'Interim service', minutes: 90, colour: 'border-l-emerald-500 bg-emerald-500/10' },
  { name: 'Repair', minutes: 120, colour: 'border-l-amber-500 bg-amber-500/10' },
  { name: 'Diagnostics', minutes: 60, colour: 'border-l-violet-500 bg-violet-500/10' },
  { name: 'Tyres', minutes: 45, colour: 'border-l-slate-500 bg-slate-500/10' },
  { name: 'Brakes', minutes: 120, colour: 'border-l-amber-500 bg-amber-500/10' },
  { name: 'Clutch', minutes: 300, colour: 'border-l-amber-500 bg-amber-500/10' },
  { name: 'Air conditioning', minutes: 60, colour: 'border-l-cyan-500 bg-cyan-500/10' },
] as const;

export const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];

export const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr${m === 60 ? '' : 's'}` : `${Math.floor(m / 60)} hr ${m % 60} min`;

/** "border-l-x bg-x/10" → { border, tint } so cards can sit on a solid background */
export const serviceColour = (name: string) => {
  const c = SERVICE_TYPES.find((s) => s.name.toLowerCase() === name.toLowerCase())?.colour ??
    (/mot/i.test(name) ? 'border-l-sky-500 bg-sky-500/10' : 'border-l-slate-400 bg-slate-500/10');
  const [border, tint] = c.split(' ');
  return { border, tint };
};
