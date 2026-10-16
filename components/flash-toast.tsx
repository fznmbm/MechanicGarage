'use client';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/** Shows a one-off success toast (e.g. after a redirect) and tidies the URL */
export function FlashToast({ message }: { message?: string | null }) {
  const shown = useRef(false);
  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    toast.success(message);
    const url = new URL(window.location.href);
    ['created', 'saved'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, '', url.toString());
  }, [message]);
  return null;
}
