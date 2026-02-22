import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    localPatterns: [
      { pathname: "/api/images/**" },
    ],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default withNextIntl(nextConfig);
