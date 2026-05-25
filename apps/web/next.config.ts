import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing from the workspace schema/db packages without transpile issues.
  transpilePackages: ["@ff14kotei/schema"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
