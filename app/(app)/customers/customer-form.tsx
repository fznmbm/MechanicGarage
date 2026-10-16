'use client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomerFields, type CustomerDefaults } from '@/components/customer-fields';
import { Field } from '@/components/field';
import { useActionToast } from '@/components/use-action-toast';
import { createCustomer, updateCustomer } from './actions';

export function CustomerForm({ customer }: { customer?: CustomerDefaults & { id: string } }) {
  const editing = !!customer;
  const { formAction, pending, err } = useActionToast(editing ? updateCustomer : createCustomer);

  return (
    <form suppressHydrationWarning action={formAction}>
      {editing && <input suppressHydrationWarning type="hidden" name="id" value={customer.id} />}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{editing ? 'Customer details' : 'Customer details'}</CardTitle>
          <CardDescription>{editing ? 'Changes are saved to every job and invoice going forward.' : 'A phone number or email is needed to contact them.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CustomerFields d={customer} err={err} />
          {!editing && (
            <Field label="Vehicle registration" htmlFor="registration" optional
              hint="Add their vehicle now. We'll look it up on the next screen.">
              <Input id="registration" name="registration" placeholder="AB12 CDE"
                className="max-w-48 bg-[#F7D117] font-mono font-bold tracking-wider text-black uppercase placeholder:text-black/40 dark:bg-[#F7D117]" />
            </Field>
          )}
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {editing ? 'Save changes' : 'Create customer'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
