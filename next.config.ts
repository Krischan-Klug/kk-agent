import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(configDir, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.KK_AGENT_STATIC_EXPORT === "1" ? "export" : undefined,
  transpilePackages: ["@krischan-klug/kk-agent-contract"],
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: repoRoot,
  },
  compiler: {
    styledComponents: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
