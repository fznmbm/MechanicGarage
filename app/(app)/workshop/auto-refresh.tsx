'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize, Minimize, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Keeps the board current (every 30 s while visible) and offers full screen for a wall-mounted tablet or TV */
export function BoardControls() {
  const router = useRouter();
  const [full, setFull] = useState(false);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const t = setInterval(tick, 30_000);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('visibilitychange', tick); };
  }, [router]);
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="icon" onClick={() => router.refresh()} aria-label="Refresh"><RefreshCw /></Button>
      <Button variant="outline" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))}>
        {full ? <Minimize /> : <Maximize />} {full ? 'Exit full screen' : 'Full screen'}
      </Button>
    </div>
  );
}
