import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PDF invoices are rendered on the server with react-pdf
  serverExternalPackages: ['@react-pdf/renderer'],
  // Lets you open the dev server from other devices on your network (phone/tablet)
  allowedDevOrigins: ['192.168.1.81', '192.168.1.*'],
  experimental: {
    // Logo and job photo uploads (photos are resized in the browser first; Vercel caps requests at 4.5 MB)
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
