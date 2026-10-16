import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getMembership } from '@/lib/tenant';
import { ImportWizard } from './import-wizard';

export const metadata = { title: 'Import customers' };

export default async function ImportPage() {
  const m = (await getMembership())!;
  if (m.role === 'mechanic') redirect('/customers');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Import customers and vehicles"
        description="Bring your customer list across from a spreadsheet or another garage system."
      >
        <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Customers
        </Link>
      </PageHeader>
      <ImportWizard />
    </div>
  );
}
