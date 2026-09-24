import type { Metadata } from "next";

/**
 * The tab title for this route. The page is a client component and cannot
 * export metadata, so it lives here — see guide/layout.tsx.
 */
export const metadata: Metadata = {
  title: "Keynote Presentations · RunFree Portal",
  description: "Teaching decks: view the slides, or download them for Keynote or PowerPoint.",
};

export default function KeynotesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
