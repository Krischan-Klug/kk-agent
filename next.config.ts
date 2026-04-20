import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(configDir, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["kk-agent-contract"],
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: repoRoot,
  },
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
