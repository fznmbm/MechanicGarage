/** Public base URL for a garage: its own domain, else slug.rootdomain */
export function garageUrl(g: { slug: string; custom_domain?: string | null }) {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const local = root.startsWith('localhost') || /^\d/.test(root);
  if (g.custom_domain) return `https://${g.custom_domain}`;
  // locally there are no subdomains: use ?garage=
  return local ? `http://${root}` : `https://${g.slug}.${root}`;
}

/** Link to a page for a garage, adding ?garage= when running locally */
export function garageLink(g: { slug: string; custom_domain?: string | null }, path: string) {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const local = !g.custom_domain && (root.startsWith('localhost') || /^\d/.test(root));
  const base = garageUrl(g);
  return local ? `${base}${path}${path.includes('?') ? '&' : '?'}garage=${g.slug}` : `${base}${path}`;
}
