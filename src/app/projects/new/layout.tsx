import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "New Project · RunFree Portal",
  description: "Start an engagement from a template.",
};

export default function ProjectsNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
