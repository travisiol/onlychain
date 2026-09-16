import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Media is served by /api/media (access-checked) and seed art is plain SVG;
  // nothing here goes through the image optimizer.
  images: { unoptimized: true },
  // /api/media streams the sample files from public/seed at runtime: ship them with that function on serverless hosts.
  outputFileTracingIncludes: { "/api/media/[id]": ["./public/seed/**/*"] },
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The Docker image runs the standalone server (see Dockerfile).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
