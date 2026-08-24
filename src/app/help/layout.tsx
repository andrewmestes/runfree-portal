import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Help · RunFree Portal",
  description: "How the portal works, and how to reach a person.",
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
