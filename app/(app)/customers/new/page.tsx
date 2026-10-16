import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { CustomerForm } from '../customer-form';

export const metadata = { title: 'New customer' };

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New customer">
        <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Customers
        </Link>
      </PageHeader>
      <CustomerForm />
    </div>
  );
}
