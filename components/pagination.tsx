import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Pagination({
  page, pageSize, total, href,
}: { page: number; pageSize: number; total: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 border-t px-3 py-3 text-sm text-muted-foreground">
      <span>Showing {from}–{to} of {total.toLocaleString('en-GB')}</span>
      {pages > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
            {page > 1 ? <Link href={href(page - 1)}><ChevronLeft /> Previous</Link> : <span><ChevronLeft /> Previous</span>}
          </Button>
          <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
            {page < pages ? <Link href={href(page + 1)}>Next <ChevronRight /></Link> : <span>Next <ChevronRight /></span>}
          </Button>
        </div>
      )}
    </div>
  );
}
