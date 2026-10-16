'use client';
import { useRef, useState, useTransition } from 'react';
import { Camera, Loader2, Trash2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deletePhoto, uploadPhoto } from '../actions';

export type JobPhoto = { id: string; url: string | null; caption: string | null };

/** Resize to max 1600px and re-encode as JPEG so phone photos upload quickly */
async function compress(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode: send as-is
  }
}

export function Photos({ jobId, photos }: { jobId: string; photos: JobPhoto[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [count, setCount] = useState(0);

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 10);
    setCount(list.length);
    start(async () => {
      let ok = 0;
      for (const f of list) {
        const fd = new FormData();
        fd.set('job_id', jobId);
        fd.set('photo', await compress(f));
        const res = await uploadPhoto({}, fd);
        if (res.ok) ok++;
        else toast.error(res.message ?? 'Upload failed');
      }
      if (ok) toast.success(ok === 1 ? 'Photo added' : `${ok} photos added`);
      if (input.current) input.current.value = '';
    });
  };

  return (
    <div className="space-y-3">
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? 'Job photo'} className="size-full object-cover" loading="lazy" />
                </a>
              ) : (
                <div className="flex size-full items-center justify-center"><ImageIcon className="text-muted-foreground" /></div>
              )}
              <form suppressHydrationWarning action={deletePhoto} className="absolute top-1 right-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <input suppressHydrationWarning type="hidden" name="photo_id" value={p.id} />
                <Button type="submit" size="icon" variant="secondary" className="size-7" aria-label="Delete photo"
                  onClick={(e) => { if (!confirm('Delete this photo?')) e.preventDefault(); }}>
                  <Trash2 className="size-3.5" />
                </Button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Photograph worn parts and damage to show the customer.</p>
      )}
      <input suppressHydrationWarning ref={input} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => onFiles(e.target.files)} />
      <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        {busy ? `Uploading ${count}…` : 'Add photos'}
      </Button>
    </div>
  );
}
