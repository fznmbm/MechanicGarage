'use client';

import { useState, useTransition } from 'react';
import { Loader2, Star } from 'lucide-react';
import { submitFeedback } from '../actions';

const LABELS = ['', 'Poor', 'Not great', 'OK', 'Good', 'Excellent'];

export function FeedbackForm({ token, brand, firstName, answered, initialScore, car, reviewUrl, garage }: {
  token: string; brand: string; firstName: string | null; answered: boolean; initialScore: number | null;
  car: string | null; reviewUrl: string | null; garage: string;
}) {
  const [score, setScore] = useState(initialScore ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(answered);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-semibold">Thank you{firstName ? `, ${firstName}` : ''}!</p>
        <p className="text-sm text-slate-600">Your feedback has gone straight to the team at {garage}.</p>
        {reviewUrl && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-4">
            <p className="text-sm">Would you also share your experience on Google? It really helps a local business.</p>
            <a href={reviewUrl} target="_blank" rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-medium text-white" style={{ background: brand }}>
              Leave a Google review
            </a>
          </div>
        )}
      </div>
    );
  }

  const shown = hover || score;
  return (
    <form className="space-y-5" onSubmit={(e) => {
      e.preventDefault();
      if (!score) { setError('Tap a star to choose a score'); return; }
      setError('');
      start(async () => {
        const r = await submitFeedback(token, score, comment);
        if (r.ok) setDone(true); else setError(r.error ?? 'Something went wrong');
      });
    }}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">How did we do{firstName ? `, ${firstName}` : ''}?</h1>
        {car && <p className="text-sm text-slate-600">Your recent visit with the {car}.</p>}
      </div>
      <div className="space-y-2">
        <div className="flex justify-center gap-2" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Score from 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={score === n} aria-label={`${n} out of 5: ${LABELS[n]}`}
              onClick={() => setScore(n)} onMouseEnter={() => setHover(n)} className="rounded-md p-1 transition-transform active:scale-90">
              <Star className="size-10" strokeWidth={1.5} style={{ color: n <= shown ? '#f59e0b' : '#cbd5e1', fill: n <= shown ? '#f59e0b' : 'transparent' }} />
            </button>
          ))}
        </div>
        <p className="h-5 text-center text-sm font-medium text-slate-600">{LABELS[shown]}</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Anything you’d like to tell us? <span className="font-normal text-slate-500">(optional)</span></span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-500" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-white disabled:opacity-60" style={{ background: brand }}>
        {pending && <Loader2 className="size-4 animate-spin" />} Send feedback
      </button>
    </form>
  );
}
