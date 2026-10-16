import { renderInvoicePdf, pdfFilename } from '@/lib/invoice-pdf';
import { loadInvoice } from '../../data';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadInvoice(id);
  if (!doc) return new Response('Not found', { status: 404 });
  const pdf = await renderInvoicePdf(doc);
  const download = new URL(req.url).searchParams.has('download');
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${pdfFilename(doc)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
