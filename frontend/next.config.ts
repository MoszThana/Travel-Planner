import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@libsql/client",
    "@libsql/client/node",
    "@libsql/isomorphic-ws"
  ],
};

export default nextConfig;
