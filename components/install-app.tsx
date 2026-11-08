'use client';

import { useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus, X, EllipsisVertical, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SidebarMenuButton } from '@/components/ui/sidebar';

type Platform = 'installed' | 'prompt' | 'ios' | 'other';
const DISMISS_KEY = 'install-banner-dismissed';

const noop = () => () => {};
function wasDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
function subscribe(cb: () => void) {
  window.addEventListener('installprompt-ready', cb);
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', cb);
  return () => { window.removeEventListener('installprompt-ready', cb); mq.removeEventListener('change', cb); };
}
function platform(): Platform {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone) return 'installed';
  if (window.__installPrompt) return 'prompt';
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS ? 'ios' : 'other';
}

/** "Install app": Chrome/Edge/Android show their own prompt; iPhone and others get the steps */
export function InstallApp({ variant = 'button', name }: { variant?: 'button' | 'banner' | 'menu'; name?: string }) {
  const p = useSyncExternalStore(subscribe, platform, () => 'installed' as Platform);
  const [help, setHelp] = useState(false);
  const saved = useSyncExternalStore(noop, wasDismissed, () => true);
  const [closed, setDismissed] = useState(false);
  const dismissed = saved || closed;

  if (p === 'installed') return null;

  const install = async () => {
    const prompt = window.__installPrompt;
    if (!prompt) return setHelp(true);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') window.__installPrompt = null;
  };

  const steps = (
    <Sheet open={help} onOpenChange={setHelp}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-md rounded-t-2xl sm:bottom-4 sm:rounded-2xl">
        <SheetHeader>
          <SheetTitle>Add {name ?? 'this app'} to your home screen</SheetTitle>
          <SheetDescription>It opens full screen like any other app, straight to your dashboard.</SheetDescription>
        </SheetHeader>
        <ol className="space-y-3 px-4 pb-6 text-sm">
          {p === 'ios' ? (
            <>
              <li className="flex items-center gap-3"><Step n={1} /> Tap the <Share className="inline size-4" /> <b>Share</b> button in Safari</li>
              <li className="flex items-center gap-3"><Step n={2} /> Scroll down and tap <SquarePlus className="inline size-4" /> <b>Add to Home Screen</b></li>
              <li className="flex items-center gap-3"><Step n={3} /> Tap <b>Add</b></li>
              <li className="text-xs text-muted-foreground">Using Chrome on iPhone? Tap the share button at the top right instead.</li>
            </>
          ) : (
            <>
              <li className="flex items-center gap-3"><Step n={1} /> Open the browser menu <EllipsisVertical className="inline size-4" /></li>
              <li className="flex items-center gap-3"><Step n={2} /> Tap <b>Install app</b> or <b>Add to Home screen</b></li>
              <li className="text-xs text-muted-foreground">Works in Chrome, Edge and Samsung Internet. On a computer, look for the install icon at the end of the address bar.</li>
            </>
          )}
        </ol>
      </SheetContent>
    </Sheet>
  );

  if (variant === 'banner') {
    // phones only, until installed or dismissed
    if (dismissed) return steps;
    return (
      <>
        <Card className="flex-row items-center gap-3 px-4 py-3 md:hidden">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Smartphone className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install the app</p>
            <p className="text-xs text-muted-foreground">One tap from your home screen, full screen.</p>
          </div>
          <Button size="sm" onClick={install}>Install</Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Not now" onClick={() => {
            setDismissed(true);
            try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
          }}><X /></Button>
        </Card>
        {steps}
      </>
    );
  }

  if (variant === 'menu') {
    return (
      <>
        <SidebarMenuButton onClick={install} tooltip="Install app"><Download /><span>Install app</span></SidebarMenuButton>
        {steps}
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={install}><Download /> Install app</Button>
      {steps}
    </>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>;
}
