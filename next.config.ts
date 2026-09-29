import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ] }];
  },
  outputFileTracingIncludes: {
    "/api/health": ["./data/snapshots/current.json"],
    "/api/snapshot": ["./data/snapshots/current.json"],
    "/api/screen": ["./data/snapshots/current.json"],
  },
};
export default config;
