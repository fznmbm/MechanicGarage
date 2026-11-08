import { ImageResponse } from "next/og";
import { imageFonts, logoData, siteBrand } from "@/lib/site-brand";

/**
 * Picture shown when a link is shared (WhatsApp, Facebook, Google, texts).
 * ?for=book shows the booking version. Never includes customer details.
 */
export async function GET(req: Request) {
  const forBook = new URL(req.url).searchParams.get("for") === "book";
  const [b, fonts] = await Promise.all([siteBrand(), imageFonts()]);
  const logo = await logoData(b.logoUrl);
  const muted =
    b.fg === "#ffffff" ? "rgba(255,255,255,0.82)" : "rgba(11,18,32,0.72)";
  const headline = forBook
    ? "Book your MOT or service online"
    : b.garage
      ? "MOT · Servicing · Repairs"
      : "Garage management, made simple";
  const footer = b.garage
    ? [b.town, b.phone].filter(Boolean).join("  ·  ")
    : "Diary · Job cards · Invoices · Reminders";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: b.colour,
        color: b.fg,
        fontFamily: "Geist",
        backgroundImage:
          "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.18) 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <div
          style={{
            width: 168,
            height: 168,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
            background: "#ffffff",
            borderRadius: 36,
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          }}
        >
          {logo?.fill ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={logo.src} width={168} height={168} />
          ) : logo ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={logo.src}
              width={132}
              height={132}
              style={{ objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 76,
                fontWeight: 700,
                color: b.colour,
              }}
            >
              {b.initials}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: b.name.length > 22 ? 58 : 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            {b.name}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: muted }}>
            {headline}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", fontSize: 32, color: muted }}>
          {footer}
        </div>
        {b.garage && forBook && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "16px 30px",
              borderRadius: 999,
              fontSize: 30,
              fontWeight: 600,
              background: b.fg,
              color: b.colour,
            }}
          >
            Choose a time
          </div>
        )}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
