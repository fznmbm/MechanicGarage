'use client';
import { Copy } from 'lucide-react';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Opens WhatsApp and submits the surrounding form (marks the approval as sent) */
export function SendLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="whatsapp" type="submit" size="sm" onClick={() => window.open(href, '_blank', 'noopener')}>
      <WhatsAppIcon className="size-4" /> {label}
    </Button>
  );
}

export function CopyAndMark({ url }: { url: string }) {
  return (
    <Button type="submit" size="sm" variant="outline" onClick={() => {
      navigator.clipboard.writeText(url).then(() => toast.success('Approval link copied'), () => toast.error('Could not copy the link'));
    }}>
      <Copy /> Copy link
    </Button>
  );
}
