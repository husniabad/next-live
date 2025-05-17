import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {

    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  output: 'standalone',
};

export default nextConfig;
