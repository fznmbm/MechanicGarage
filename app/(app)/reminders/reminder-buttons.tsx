'use client';
import Link from 'next/link';
import { useTransition } from 'react';
import { Phone, Check, CalendarPlus } from 'lucide-react';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { logReminder } from './actions';

export function ReminderButtons({
  vehicleId, kind, due, waUrl, tel,
}: { vehicleId: string; kind: string; due: string | null; waUrl: string | null; tel: string | null }) {
  const [busy, start] = useTransition();
  const log = (channel: string, msg?: string) => start(async () => {
    await logReminder({ vehicleId, kind, due, channel });
    if (msg) toast.success(msg);
  });
  return (
    <div className="relative z-10 flex flex-wrap justify-end gap-1.5">
      {waUrl && (
        <Button size="sm" variant="whatsapp" asChild>
          <a href={waUrl} target="_blank" rel="noreferrer" onClick={() => log('whatsapp')}><WhatsAppIcon className="size-4" /> WhatsApp</a>
        </Button>
      )}
      {tel && (
        <Button size="sm" variant="outline" asChild>
          <a href={`tel:${tel}`} onClick={() => log('phone')}><Phone /> Call</a>
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => log('manual', 'Marked as reminded')}><Check /> Done</Button>
      <Button size="sm" variant="ghost" asChild><Link href={`/diary/new?vehicle=${vehicleId}`}><CalendarPlus /> Book</Link></Button>
    </div>
  );
}
