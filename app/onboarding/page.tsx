import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { getMembership } from '@/lib/tenant';

export const metadata = { title: 'Set up your garage' };

async function createGarage(fd: FormData) {
  'use server';
  const supabase = await createClient();
  const slug = String(fd.get('slug')).toLowerCase().trim();
  const { error } = await supabase.rpc('create_garage', {
    p_name: String(fd.get('name')).trim(),
    p_slug: slug,
    p_display_name: String(fd.get('display_name')).trim(),
  });
  if (error) redirect('/onboarding?error=' + encodeURIComponent(error.message));
  redirect(`/?garage=${slug}`);
}

export default async function Onboarding({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  if (await getMembership()) redirect('/');
  const { error } = await searchParams;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Set up your garage</CardTitle>
          <CardDescription>You can change all of this later in Settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <form suppressHydrationWarning action={createGarage} className="space-y-5">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="name">Garage name</Label>
              <Input id="name" name="name" placeholder="Smith's Garage" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Web address</Label>
              <div className="flex rounded-md border border-input focus-within:ring-[3px] focus-within:ring-ring/50">
                <Input id="slug" name="slug" required pattern="[a-z0-9-]+" placeholder="smithsgarage"
                  className="border-0 shadow-none focus-visible:ring-0" />
                <span className="flex items-center border-l bg-muted px-3 text-sm text-muted-foreground">
                  .{process.env.NEXT_PUBLIC_ROOT_DOMAIN}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Your name</Label>
              <Input id="display_name" name="display_name" required />
            </div>
            <Button className="w-full" size="lg">Create garage</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
