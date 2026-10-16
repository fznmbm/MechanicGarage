import { readableOn, safeColour } from '@/lib/brand';

// Applies the garage's brand colour site-wide (buttons, sidebar highlight, focus rings, menus)
export function BrandStyle({ colour }: { colour?: string | null }) {
  const c = safeColour(colour);
  if (!c) return null;
  const fg = readableOn(c);
  const css = `:root,.dark{--primary:${c};--primary-foreground:${fg};--sidebar-primary:${c};--sidebar-primary-foreground:${fg};--ring:${c};--sidebar-ring:${c};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
