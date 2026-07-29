import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The shared package ships TypeScript source rather than a build step, so the slot codec
   * has exactly one compiled form and the contracts, the keeper and the app can never drift
   * onto different copies of it.
   */
  transpilePackages: ["@testament/shared"],
};

export default nextConfig;
