import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Prevent webpack from bundling WASM/native packages — loaded from node_modules at runtime
  serverExternalPackages: ["tesseract.js", "heic-convert", "pdf-parse", "sharp"],
  // Ensure the Heebo TTF files used by server-side PDF rendering ship with the
  // work-diary email routes on Vercel. public/ is normally CDN-only, not bundled
  // into function code.
  outputFileTracingIncludes: {
    "/api/work-diary/[id]/archive-email": ["./public/fonts/Heebo-*.ttf"],
    "/api/work-diary/[id]/customer-email": ["./public/fonts/Heebo-*.ttf"],
  },
};

export default nextConfig;
