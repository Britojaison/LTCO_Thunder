import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // "/" has no page of its own; send people to the influencer search.
  async redirects() {
    return [{ source: "/", destination: "/influencers", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
