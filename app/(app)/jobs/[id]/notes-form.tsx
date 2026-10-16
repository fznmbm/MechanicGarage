'use client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { saveJobNotes } from '../actions';

export function NotesForm({ id, complaint, notes }: { id: string; complaint: string | null; notes: string | null }) {
  const { formAction, pending } = useActionToast(saveJobNotes);
  return (
    <form suppressHydrationWarning action={formAction} className="space-y-4">
      <input suppressHydrationWarning type="hidden" name="id" value={id} />
      <Field label="Work requested / customer’s description" htmlFor="customer_complaint">
        <Textarea id="customer_complaint" name="customer_complaint" rows={3} defaultValue={complaint ?? ''} />
      </Field>
      <Field label="Mechanic’s findings" htmlFor="mechanic_notes" hint="What was found and done. Shown on the job sheet.">
        <Textarea id="mechanic_notes" name="mechanic_notes" rows={4} defaultValue={notes ?? ''}
          placeholder="e.g. Front discs below minimum thickness, pads 2mm. Replaced both. Road tested OK." />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save notes</Button>
      </div>
    </form>
  );
}
