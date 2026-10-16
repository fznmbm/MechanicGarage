'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DateNav({ date, prev, next, today }: { date: string; prev: string; next: string; today: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" asChild aria-label="Previous day">
        <Link href={`/diary?date=${prev}`}><ChevronLeft /></Link>
      </Button>
      <Button variant="outline" asChild disabled={date === today}>
        <Link href={`/diary?date=${today}`}>Today</Link>
      </Button>
      <Button variant="outline" size="icon" asChild aria-label="Next day">
        <Link href={`/diary?date=${next}`}><ChevronRight /></Link>
      </Button>
      <Input type="date" value={date} aria-label="Go to date" className="w-40"
        onChange={(e) => e.target.value && router.push(`/diary?date=${e.target.value}`)} />
    </div>
  );
}
