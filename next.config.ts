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
    NEXT_PUBLIC_APP_NAME: "RunFree Portal",
  },
  // The one-page Vision Frame PDF embeds the brand faces and the wordmark
  // from disk. Vercel's function bundle only carries what the tracer can see
  // being read, and readFile(path.join(process.cwd(), …)) is not statically
  // traceable — so these are named explicitly.
  outputFileTracingIncludes: {
    "/api/projects/[id]/vision-frame": ["./src/lib/pdf/fonts/*.ttf", "./public/brand/runfree-logo-white.png"],
  },
};

export default nextConfig;
