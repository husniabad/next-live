import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // <--- Add this line here

  /* Add other config options here if needed */
  // e.g., images: { unoptimized: true },
  //       trailingSlash: true,
};

export default nextConfig;
