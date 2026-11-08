import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF invoices are rendered on the server with react-pdf
  serverExternalPackages: ["@react-pdf/renderer"],
  // the app's font, used to draw app icons and link-preview images
  outputFileTracingIncludes: {
    "/brand/**": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-{Regular,Bold}.ttf",
    ],
  },
  // Lets you open the dev server from other devices on your network (phone/tablet)
  allowedDevOrigins: ["192.168.1.81", "192.168.1.*"],
  // old browsers and bookmarks ask for /favicon.ico: give them the garage's own icon
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/brand/icon?size=32" }];
  },
  async headers() {
    return [
      {
        // the service worker must always be fresh so updates reach installed apps
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
  experimental: {
    // Logo and job photo uploads (photos are resized in the browser first; Vercel caps requests at 4.5 MB)
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
