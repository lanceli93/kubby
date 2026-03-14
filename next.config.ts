import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function getAppVersion(): string {
  if (process.env.KUBBY_VERSION) return process.env.KUBBY_VERSION;
  try {
    const tag = execSync("git describe --tags --abbrev=0", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    return tag.startsWith("v") ? tag.slice(1) : tag;
  } catch {}
  return JSON.parse(readFileSync("package.json", "utf-8")).version;
}

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
  images: {
    unoptimized: true, // We handle image optimization ourselves in /api/images/ via sharp
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  serverExternalPackages: ["better-sqlite3", "sharp"],
};

export default withNextIntl(nextConfig);
