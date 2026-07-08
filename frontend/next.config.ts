import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for @cloudflare/next-on-pages edge runtime compatibility
  experimental: {
    // Disable server actions workaround for Cloudflare edge compatibility
  },
};

export default nextConfig;
