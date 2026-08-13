import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "drive.google.com" },
      // Loom thumbnails — see lib/loom.ts for why these are resolved
      // server-side rather than guessed from the share id.
      { protocol: "https", hostname: "cdn.loom.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: "RunFree Client Portal",
  },
};

export default nextConfig;
