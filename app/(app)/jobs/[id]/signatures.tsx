'use client';

import { useState } from 'react';
import { Loader2, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/field';
import { SignaturePad } from '@/components/signature-pad';
import { useActionToast } from '@/components/use-action-toast';
import { ukDate } from '@/lib/format';
import { ukTime } from '@/lib/time';
import { saveSignature } from '../actions';

export type SignatureRow = { id: string; kind: 'check_in' | 'collection'; signer_name: string; signed_at: string; statement: string; url: string | null };

const KINDS = {
  check_in: { title: 'Authorisation at check-in', button: 'Customer signs to authorise work' },
  collection: { title: 'Collection', button: 'Customer signs on collection' },
} as const;

export const COLLECTION_STATEMENT = 'I have collected the vehicle and been told about the work carried out.';

function Capture({ jobId, kind, statement, defaultName, onDone }: {
  jobId: string; kind: 'check_in' | 'collection'; statement: string; defaultName: string; onDone: () => void;
}) {
  const { formAction, pending, err, state } = useActionToast(saveSignature);
  const [png, setPng] = useState<string | null>(null);
  const [seen, setSeen] = useState(state.ts);
  if (state.ts !== seen) { setSeen(state.ts); if (state.ok) onDone(); }
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="png" value={png ?? ''} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">{statement}</p>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onDone} aria-label="Cancel"><X /></Button>
      </div>
      <SignaturePad onChange={setPng} />
      {err('png') && <p className="text-xs text-destructive">{err('png')}</p>}
      <Field label="Name" htmlFor={`sig_name_${kind}`} error={err('signer_name')}>
        <Input id={`sig_name_${kind}`} name="signer_name" defaultValue={defaultName} autoComplete="off" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending || !png}>{pending && <Loader2 className="animate-spin" />} Save signature</Button>
    </form>
  );
}

export function Signatures({ jobId, rows, authorisation, customerName }: {
  jobId: string; rows: SignatureRow[]; authorisation: string; customerName: string;
}) {
  const [open, setOpen] = useState<'check_in' | 'collection' | null>(null);
  const latest = (k: 'check_in' | 'collection') => rows.filter((r) => r.kind === k).at(-1);
  return (
    <div className="space-y-4">
      {(['check_in', 'collection'] as const).map((k) => {
        const sig = latest(k);
        return (
          <div key={k} className="space-y-2">
            <div className="text-sm font-medium">{KINDS[k].title}</div>
            {sig && (
              <div className="rounded-lg border bg-white p-2">
                {sig.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={sig.url} alt={`Signature of ${sig.signer_name}`} className="h-16 w-full object-contain" />
                  : <div className="h-16" />}
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{sig.signer_name}</span><span>{ukDate(sig.signed_at)} {ukTime(sig.signed_at)}</span>
                </div>
              </div>
            )}
            {open === k ? (
              <Capture jobId={jobId} kind={k} statement={k === 'check_in' ? authorisation : COLLECTION_STATEMENT}
                defaultName={customerName} onDone={() => setOpen(null)} />
            ) : (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(k)}>
                <PenLine /> {sig ? 'Sign again' : KINDS[k].button}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
