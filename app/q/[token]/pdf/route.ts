import { renderInvoicePdf, pdfFilename } from '@/lib/invoice-pdf';
import { loadPublicEstimate } from '@/app/(app)/estimates/data';

// Public: the customer's private estimate link
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await loadPublicEstimate(token);
  if (!doc) return new Response('Not found', { status: 404 });
  const pdf = await renderInvoicePdf(doc);
  const download = new URL(req.url).searchParams.has('download');
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${pdfFilename(doc)}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
