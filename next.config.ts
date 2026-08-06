import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The Railway URL is public and unauthenticated - it has to be, for the
   * demo. It should not also be searchable. X-Robots-Tag covers every route
   * including the API ones, which a robots.txt would not, because robots.txt
   * is a crawl hint rather than a response-level directive.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
