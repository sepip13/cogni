import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "stripe"],
  // Lets the deploy build into a throwaway dir (NEXT_DIST_DIR=.next-build) and
  // atomically swap it into place, so the running server never reads a
  // half-written .next during a build. Runtime leaves this unset → ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
