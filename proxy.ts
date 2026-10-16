import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { needsCode } from './lib/mfa';

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN!;
const PUBLIC_PATHS = ['/login', '/book', '/auth', '/i/', '/c/', '/f/', '/q/', '/join/', '/a/', '/u/', '/api/'];

function resolveTenant(req: NextRequest): { slug?: string; host?: string; fromQuery?: boolean } {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  const q = req.nextUrl.searchParams.get('garage');
  if (q) return { slug: q.toLowerCase(), fromQuery: true };

  if (host.endsWith(`.${ROOT}`)) {
    const sub = host.slice(0, -(ROOT.length + 1));
    return sub === 'www' ? {} : { slug: sub };
  }
  // Root domain, Vercel preview URLs, localhost and LAN IPs: use the remembered garage
  if (
    host === ROOT ||
    host.endsWith('.vercel.app') ||
    host.startsWith('localhost') ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)
  ) {
    return { slug: req.cookies.get('rd_garage')?.value };
  }
  return { host }; // garage's own custom domain
}

export async function proxy(req: NextRequest) {
  const tenant = resolveTenant(req);

  const headers = new Headers(req.headers);
  headers.delete('x-garage-slug');
  headers.delete('x-garage-host');
  if (tenant.slug) headers.set('x-garage-slug', tenant.slug);
  if (tenant.host) headers.set('x-garage-host', tenant.host);

  let res = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          headers.set('cookie', req.headers.get('cookie') ?? '');
          res = NextResponse.next({ request: { headers } });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (tenant.fromQuery && tenant.slug) {
    res.cookies.set('rd_garage', tenant.slug, { path: '/', sameSite: 'lax', maxAge: 31_536_000 });
  }

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const send = (pathname: string, search = '') => {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };
  if (!user && !isPublic) return send('/login');
  // two-factor: signed in with a password but the 6-digit code hasn't been entered yet
  if (user && !isPublic && !path.startsWith('/api/') && (await needsCode(supabase, user))) {
    return send('/login/mfa', `?next=${encodeURIComponent(path + req.nextUrl.search)}`);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
