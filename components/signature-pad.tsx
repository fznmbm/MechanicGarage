'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Finger / stylus / mouse signature box. Calls onChange with a PNG data URL, or null when cleared. */
export function SignaturePad({ onChange, height = 180 }: { onChange: (png: string | null) => void; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // match the canvas to its size on screen (sharp on high-DPI tablets)
  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (c.width === w && c.height === h) return;
      // resizing a canvas wipes it (e.g. the phone keyboard opening): keep what was drawn
      const keep = c.width && c.height ? (() => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d')!.drawImage(c, 0, 0); return t; })() : null;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      if (keep) ctx.drawImage(keep, 0, 0, keep.width, keep.height, 0, 0, w, h);
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (!empty) onChange(canvas.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border-2 border-dashed bg-white" style={{ height }}>
        <canvas ref={canvas} className="absolute inset-0 size-full touch-none" aria-label="Signature box"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
        {empty && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-slate-400">Sign here</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-slate-300" />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={empty}><Eraser /> Clear</Button>
      </div>
    </div>
  );
}
