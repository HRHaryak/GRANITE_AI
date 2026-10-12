import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.CAPACITOR_BUILD === "true" ? "export" : undefined,
  images: { unoptimized: true },
  // Legacy desktop screens have lint errors; the mobile app under /m is lint-clean.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
