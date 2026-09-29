import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/health": ["./data/snapshots/current.json"],
    "/api/snapshot": ["./data/snapshots/current.json"],
    "/api/screen": ["./data/snapshots/current.json"],
  },
};
export default config;
