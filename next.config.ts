import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/docs/*": ["./docs/**/*.md"],
    "/postman/*": ["./postman/*.json"],
  },
};

export default nextConfig;
