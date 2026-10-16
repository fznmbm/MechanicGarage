import Link from 'next/link';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Placeholder for sections not built yet (Diary, Jobs, Customers...). Real pages replace this automatically.
export default async function ComingSoon({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const title = slug[0].charAt(0).toUpperCase() + slug[0].slice(1);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Construction className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">{title} is coming soon</h1>
        <p className="mt-1 text-sm text-muted-foreground">This section is part of the next build step.</p>
      </div>
      <Button variant="outline" asChild><Link href="/">Back to dashboard</Link></Button>
    </div>
  );
}
