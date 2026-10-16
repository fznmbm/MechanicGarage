'use client';

import { Loader2, Send, Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionToast } from '@/components/use-action-toast';
import { emailEstimate, markEstimateSent } from '../actions';

export function EmailEstimateForm({ id, defaultTo }: { id: string; defaultTo: string }) {
  const { formAction, pending, err } = useActionToast(emailEstimate);
  return (
    <form suppressHydrationWarning action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="id" value={id} />
      <div className="flex-1 space-y-1">
        <Input name="to" type="email" defaultValue={defaultTo} placeholder="customer@example.com" aria-label="Email address" aria-invalid={!!err('to')} />
        {err('to') && <p className="text-xs text-destructive">{err('to')}</p>}
      </div>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Send</Button>
    </form>
  );
}

/** WhatsApp or copy the customer's link; either marks the estimate as sent */
export function ShareButtons({ id, link, whatsapp }: { id: string; link: string; whatsapp: string | null }) {
  return (
    <form suppressHydrationWarning action={markEstimateSent} className="flex flex-wrap gap-2">
      <input type="hidden" name="id" value={id} />
      {whatsapp && (
        <Button type="submit" size="sm" variant="outline" onClick={() => window.open(whatsapp, '_blank', 'noopener')}><MessageCircle /> WhatsApp</Button>
      )}
      <Button type="submit" size="sm" variant="outline" onClick={() => {
        navigator.clipboard.writeText(link).then(() => toast.success('Link copied'), () => toast.error('Could not copy the link'));
      }}><Copy /> Copy link</Button>
    </form>
  );
}
