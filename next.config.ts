import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
    unoptimized: true, // Local images served via API don't need Next.js optimization
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
