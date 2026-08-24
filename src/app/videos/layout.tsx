import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Training Videos · RunFree Portal",
  description: "Walkthroughs and coaching for each tool.",
};

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
