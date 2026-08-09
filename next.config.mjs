/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Historical/holder API routes hit Helius + Neon per request and can take
  // longer than the default limit when reconstructing time-travel snapshots.
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
