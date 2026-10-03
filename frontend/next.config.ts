import type { NextConfig } from "next";
import { setupDevPlatform } from "@cloudflare/next-on-pages/next-dev";

// In `next dev`, expose local D1/R2 bindings from wrangler.toml to getRequestContext()
if (process.env.NODE_ENV === "development") {
  setupDevPlatform().catch(console.error);
}

const nextConfig: NextConfig = {};

export default nextConfig;
