import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Prevent webpack from bundling WASM/native packages — loaded from node_modules at runtime
  serverExternalPackages: ["tesseract.js", "heic-convert", "pdf-parse", "sharp"],
};

export default nextConfig;
