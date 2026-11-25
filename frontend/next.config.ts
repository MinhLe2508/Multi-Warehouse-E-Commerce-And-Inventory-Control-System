import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "vietqr.app", pathname: "/img" }],
  },
  turbopack: { root: __dirname },
};

export default nextConfig;
