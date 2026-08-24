import type { Metadata } from "next";

/**
 * The tab title for this route.
 *
 * The page itself is a client component and cannot export metadata, so it
 * lives here. Without it every page in the portal inherited the root layout's
 * "RunFree Portal" and every open tab looked identical.
 */
export const metadata: Metadata = {
  title: "Facilitator's Guide · RunFree Portal",
  description: "The complete training playbook.",
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
