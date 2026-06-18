import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment (Phase 8)
  output: "standalone",

  // This project lives in a subfolder of the prototype workspace, which has
  // its own lockfile. Pin the workspace root so Next does not infer the parent.
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },

  // Optimize images
  images: {
    unoptimized: true, // For container deployment
  },
};

export default nextConfig;
