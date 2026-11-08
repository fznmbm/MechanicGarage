'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Check, CheckCircle2, ChevronDown, ChevronRight, CalendarPlus, MoreHorizontal, PartyPopper, SkipForward, User, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RegPlate } from '@/components/reg-plate';
import { WhatsAppIcon } from '@/components/whatsapp-icon';
import { WhatsAppBubble as Bubble } from '@/components/whatsapp-bubble';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { markQueueItem, undoQueueItem } from './actions';

export type SendItem = {
  key: string; vehicleId: string; customerId: string; kind: 'mot' | 'service'; due: string; stage: number;
  reg: string; vehicle: string; customer: string; phone: string; label: string; overdue: boolean;
  message: string; waUrl: string;
};
export type SentItem = { key: string; reg: string; customer: string; label: string; how: string; when: string; by: string | null };

type State = 'sent' | 'done';

export function SendList({ items, sent, desktopHint }: { items: SendItem[]; sent: SentItem[]; desktopHint: boolean }) {
  const [state, setState] = useState<Record<string, State>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [run, setRun] = useState<{ index: number; opened: boolean } | null>(null);
  const [showSent, setShowSent] = useState(false);
  const [, start] = useTransition();

  const waiting = items.filter((i) => !state[i.key]);
  const overdue = items.filter((i) => i.overdue);
  const upcoming = items.filter((i) => !i.overdue);

  const mark = (i: SendItem, how: 'whatsapp' | 'done') => {
    setState((s) => ({ ...s, [i.key]: how === 'whatsapp' ? 'sent' : 'done' }));
    start(async () => {
      const res = await markQueueItem({ vehicleId: i.vehicleId, kind: i.kind, due: i.due, stage: i.stage, how });
      if (!res.ok && res.message?.startsWith('Already')) toast.info(res.message);
      else if (!res.ok) {
        setState((s) => { const n = { ...s }; delete n[i.key]; return n; });
        toast.error(res.message ?? 'Could not save');
      } else if (how === 'done') toast.success('Marked as done', { action: { label: 'Undo', onClick: () => undo(i) } });
    });
  };
  const undo = (i: SendItem) => {
    setState((s) => { const n = { ...s }; delete n[i.key]; return n; });
    start(async () => { await undoQueueItem({ vehicleId: i.vehicleId, kind: i.kind, due: i.due, stage: i.stage }); });
  };

  // ---------- "Start sending": one customer at a time ----------
  const startRun = () => {
    const first = items.findIndex((i) => !state[i.key]);
    if (first >= 0) setRun({ index: first, opened: false });
  };
  const nextIndex = (from: number) => items.findIndex((i, n) => n > from && !state[i.key]);
  const current = run ? items[run.index] : null;
  const position = run ? run.index + 1 : 0;

  const row = (i: SendItem) => {
    const s = state[i.key];
    return (
      <li key={i.key} className={cn('px-4 py-3 transition-colors', s && 'bg-muted/40')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <RegPlate reg={i.reg} className="text-sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{i.customer}<span className="font-normal text-muted-foreground"> · {i.vehicle}</span></div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Badge variant="outline" className={cn(i.overdue && 'border-destructive/40 text-destructive')}>{i.label}</Badge>
                <span>{i.phone}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-1.5">
            {s ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" /> {s === 'sent' ? 'Sent' : 'Done'}
                </span>
                <Button size="sm" variant="ghost" onClick={() => undo(i)}><Undo2 /> Undo</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === i.key ? null : i.key)} aria-expanded={open === i.key}>
                  {open === i.key ? <ChevronDown /> : <ChevronRight />} Message
                </Button>
                <Button size="sm" variant="whatsapp" asChild>
                  <a href={i.waUrl} target="_blank" rel="noreferrer" onClick={() => mark(i, 'whatsapp')}>
                    <WhatsAppIcon className="size-4" /> Send
                  </a>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="size-8" aria-label="More options"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => mark(i, 'done')}><Check /> Mark done without sending</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild><Link href={`/diary/new?vehicle=${i.vehicleId}`}><CalendarPlus /> Book in</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link href={`/customers/${i.customerId}`}><User /> Open customer</Link></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
        {open === i.key && !s && <div className="mt-3 max-w-md sm:ml-auto"><Bubble text={i.message} /></div>}
      </li>
    );
  };

  const section = (title: string, list: SendItem[], tone?: 'danger') => list.length > 0 && (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={cn('border-b bg-muted/40 px-4 py-2 text-xs font-medium tracking-wide uppercase', tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')}>
        {title} · {list.length}
      </div>
      <ul className="divide-y">{list.map(row)}</ul>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Summary and the main button */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-4">
          <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', waiting.length ? 'bg-[#25D366]/15 text-[#128C7E]' : 'bg-success/15 text-success')}>
            {waiting.length ? <WhatsAppIcon className="size-6" /> : <PartyPopper className="size-6" />}
          </span>
          <div>
            <p className="text-lg font-semibold">
              {waiting.length ? `${waiting.length} reminder${waiting.length === 1 ? '' : 's'} to send` : items.length ? 'All sent for today' : 'Nothing to send today'}
            </p>
            <p className="text-sm text-muted-foreground">
              {waiting.length
                ? `Each opens WhatsApp with the message ready. Just press send.${desktopHint ? ' On a computer it uses WhatsApp Web or the desktop app.' : ''}`
                : 'New reminders appear here automatically as MOTs and services come due.'}
            </p>
          </div>
        </div>
        {waiting.length > 0 && (
          <Button size="lg" variant="whatsapp" onClick={startRun} className="w-full sm:w-auto">
            <WhatsAppIcon className="size-5" /> Start sending
          </Button>
        )}
      </Card>

      {section('MOT expired', overdue, 'danger')}
      {section('Coming up', upcoming)}

      {sent.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <button type="button" onClick={() => setShowSent(!showSent)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-muted/40" aria-expanded={showSent}>
            <span>Sent today · {sent.length}</span>
            {showSent ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {showSent && (
            <ul className="divide-y border-t">
              {sent.map((s) => (
                <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <RegPlate reg={s.reg} className="text-xs" />
                  <span className="min-w-0 flex-1 truncate">{s.customer} <span className="text-muted-foreground">· {s.label}</span></span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="size-3.5 text-success" /> {s.how} {s.when}{s.by ? ` · ${s.by}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* One at a time */}
      <Sheet open={!!run} onOpenChange={(o) => !o && setRun(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-2xl sm:bottom-4 sm:rounded-2xl">
          {current ? (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle>Sending reminders</SheetTitle>
                <SheetDescription>Customer {position} of {items.length}</SheetDescription>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${(Object.keys(state).length / items.length) * 100}%` }} />
                </div>
              </SheetHeader>
              <div className="space-y-4 px-4">
                <div className="flex items-center gap-3">
                  <RegPlate reg={current.reg} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{current.customer}</div>
                    <div className="text-sm text-muted-foreground">{current.vehicle} · {current.phone}</div>
                  </div>
                </div>
                <Badge variant="outline" className={cn(current.overdue && 'border-destructive/40 text-destructive')}>{current.label}</Badge>
                <div className="rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]"><Bubble text={current.message} /></div>
              </div>
              <div className="flex flex-col gap-2 p-4">
                {!run!.opened ? (
                  <>
                    <Button size="lg" variant="whatsapp" asChild>
                      <a href={current.waUrl} target="_blank" rel="noreferrer" onClick={() => { mark(current, 'whatsapp'); setRun({ ...run!, opened: true }); }}>
                        <WhatsAppIcon className="size-5" /> Open WhatsApp
                      </a>
                    </Button>
                    <Button variant="ghost" onClick={() => {
                      const n = nextIndex(run!.index);
                      setRun(n >= 0 ? { index: n, opened: false } : null);
                    }}><SkipForward /> Skip for now</Button>
                  </>
                ) : (
                  <>
                    <p className="flex items-center justify-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" /> Marked as sent</p>
                    <Button size="lg" onClick={() => {
                      const n = nextIndex(run!.index);
                      if (n >= 0) setRun({ index: n, opened: false });
                      else { setRun(null); toast.success('All reminders sent'); }
                    }}>
                      {nextIndex(run!.index) >= 0 ? 'Next customer' : 'Finish'}
                    </Button>
                    <Button variant="ghost" onClick={() => { undo(current); setRun({ ...run!, opened: false }); }}>
                      <Undo2 /> Didn’t send it
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : <SheetTitle className="sr-only">Sending reminders</SheetTitle>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
