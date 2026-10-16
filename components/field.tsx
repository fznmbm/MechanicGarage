import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function Field({
  label, htmlFor, error, hint, className, optional, children,
}: {
  label: string; htmlFor: string; error?: string; hint?: React.ReactNode; className?: string; optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
