import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Site Admin · RunFree Portal",
  description: "People, permissions and training videos.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
