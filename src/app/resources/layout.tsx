import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Handouts · RunFree Portal",
  description: "Certification handouts, module by module.",
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
