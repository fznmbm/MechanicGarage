'use client';
import { Button } from '@/components/ui/button';

/** Submit button that asks for confirmation first (for deletes) */
export function ConfirmSubmit({
  message, children, ...props
}: React.ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
