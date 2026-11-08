/* IronBay service worker.
   Pages always come from the network so prices, jobs and invoices are never out of date.
   If there's no connection, a simple "You're offline" page is shown instead of the browser's error. */

const OFFLINE_HTML = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're offline</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100svh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }
  .card { max-width: 360px; text-align: center; }
  .icon { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 16px; background: #e2e8f0; display: flex;
    align-items: center; justify-content: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #475569; line-height: 1.5; }
  button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; padding: 12px 20px; background: #0f172a; color: #fff; cursor: pointer; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e2e8f0; } .icon { background: #1e293b; } p { color: #94a3b8; }
    button { background: #e2e8f0; color: #0b1220; }
  }
</style></head>
<body><div class="card">
  <div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.39"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/></svg></div>
  <h1>You're offline</h1>
  <p>Check your Wi-Fi or mobile signal. Nothing has been lost: anything you saved before is safe.</p>
  <button onclick="location.reload()">Try again</button>
</div>
<script>addEventListener('online', function () { location.reload(); });</script>
</body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // only full page loads; everything else goes straight to the network as normal
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
