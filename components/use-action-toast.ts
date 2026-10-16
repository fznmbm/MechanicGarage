'use client';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import type { ActionState } from '@/lib/types';

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

/** useActionState + toast on result + field error lookup */
export function useActionToast(action: Action) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (!state.ts) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message ?? 'Something went wrong');
  }, [state]);
  return { state, formAction, pending, err: (k: string) => state.errors?.[k] };
}
