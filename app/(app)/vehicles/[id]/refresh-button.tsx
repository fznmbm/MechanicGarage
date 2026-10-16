'use client';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActionToast } from '@/components/use-action-toast';
import { refreshVehicle } from '../actions';

export function RefreshButton({ id }: { id: string }) {
  const { formAction, pending } = useActionToast(refreshVehicle);
  return (
    <form suppressHydrationWarning action={formAction}>
      <input suppressHydrationWarning type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pending}>
        <RefreshCw className={pending ? 'animate-spin' : ''} />
        {pending ? 'Checking…' : 'Refresh from DVSA'}
      </Button>
    </form>
  );
}
