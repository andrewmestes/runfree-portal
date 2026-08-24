import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Certified Framers · RunFree Portal",
  description: "The certified vision framer roster.",
};

export default function AdminFramersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
