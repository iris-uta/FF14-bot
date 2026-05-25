import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing from the workspace schema/db packages without transpile issues.
  transpilePackages: ["@ff14kotei/schema"],
  // typedRoutes disabled — generates RouteImpl<> types that conflict with
  // dynamic-route paths (e.g. /api/auth/signin?callbackUrl=...) in `tsc --noEmit`.
  // Re-enable if needed in the future with explicit casts.
};

export default nextConfig;
