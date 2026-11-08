import "server-only";
import { PRODUCT_NAME, readableOn, safeColour } from "./brand";
import { getTenant } from "./tenant";

/**
 * Name, colour and logo for the address being visited: the garage on its own subdomain or domain,
 * otherwise the product itself. Used for the installable app (icons, manifest) and link previews.
 */
export type SiteBrand = {
  garage: boolean;
  name: string;
  shortName: string;
  colour: string;
  fg: string;
  logoUrl: string | null;
  initials: string;
  town: string | null;
  phone: string | null;
  version: string;
};

export const DEFAULT_COLOUR = "#1A5BA6";

export async function siteBrand(): Promise<SiteBrand> {
  const t = await getTenant();
  const name = t?.name ?? PRODUCT_NAME;
  const colour = safeColour(t?.brand_colour) ?? DEFAULT_COLOUR;
  const logoUrl =
    t?.logo_url && /^https:\/\//.test(t.logo_url) ? t.logo_url : null;
  return {
    garage: !!t,
    name,
    shortName: name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 12),
    colour,
    fg: readableOn(colour),
    logoUrl,
    initials:
      name
        .split(/\s+/)
        .filter((w) => /^[A-Za-z0-9]/.test(w))
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "G",
    town: townOf(t?.address ?? null),
    phone: t?.phone ?? null,
    // changes whenever the name, colour or logo change, so phones and WhatsApp fetch fresh icons and previews
    version: hash(`${name}|${colour}|${logoUrl ?? ""}`),
  };
}

/** Last line of the address that isn't a postcode, e.g. "Crawley" */
function townOf(address: string | null) {
  if (!address) return null;
  const parts = address
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p));
  const town = parts[parts.length - 1];
  return parts.length > 1 && town && town.length <= 40 && !/\d/.test(town)
    ? town
    : null;
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * The logo ready for image generation (PNG, JPEG, WebP or SVG), or null if it can't be used.
 * fill = it's a square picture with its own background (like an app icon), so it can fill the whole icon
 * instead of sitting on a white tile.
 */
export async function logoData(
  url: string | null,
): Promise<{ src: string; fill: boolean } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (
      !["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(type)
    )
      return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    if (type === "image/svg+xml")
      return {
        src: `data:${type};base64,${buf.toString("base64")}`,
        fill: false,
      };
    try {
      // sharp comes with Next.js: makes a tidy PNG (the image generator can't read WebP) and checks the shape
      const sharp = (await import("sharp")).default;
      const img = sharp(buf);
      const { width = 0, height = 0 } = await img.metadata();
      const png = await img
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      let fill = false;
      if (width && height && Math.abs(width / height - 1) < 0.08) {
        // opaque corners = it has its own background
        const { data, info } = await sharp(png)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const at = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
        const w = info.width - 1,
          h = info.height - 1;
        fill = [at(2, 2), at(w - 2, 2), at(2, h - 2), at(w - 2, h - 2)].every(
          (a) => a > 240,
        );
      }
      return { src: `data:image/png;base64,${png.toString("base64")}`, fill };
    } catch {
      return type === "image/webp"
        ? null
        : { src: `data:${type};base64,${buf.toString("base64")}`, fill: false };
    }
  } catch {
    return null;
  }
}

/** The app's own font (Geist) for generated images; files are included in the deployment via next.config.ts */
let fonts: Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]
> | null = null;
export function imageFonts() {
  fonts ??= (async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans");
    const load = async (file: string) => {
      const b = await readFile(join(dir, file));
      return b.buffer.slice(
        b.byteOffset,
        b.byteOffset + b.byteLength,
      ) as ArrayBuffer;
    };
    try {
      const [regular, bold] = await Promise.all([
        load("Geist-Regular.ttf"),
        load("Geist-Bold.ttf"),
      ]);
      return [
        {
          name: "Geist",
          data: regular,
          weight: 400 as const,
          style: "normal" as const,
        },
        {
          name: "Geist",
          data: bold,
          weight: 700 as const,
          style: "normal" as const,
        },
      ];
    } catch {
      fonts = null;
      return []; // falls back to the built-in font
    }
  })();
  return fonts;
}
