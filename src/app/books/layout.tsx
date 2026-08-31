import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Books · RunFree Portal",
  description: "Visual summaries, chapters and full downloads.",
};

export default function BooksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
