import type { Metadata } from "next";

/**
 * The tab title for /open/{kind}/{id}.
 *
 * The page is a client component and cannot export metadata, so it lives
 * here, as for guide/layout.tsx: without it every guide link opened a tab
 * called "RunFree Portal", and a handout, a video and the Companion Guide
 * side by side looked identical. This names the kind; the page swaps in the
 * file's own name once it has loaded.
 */
const LABELS: Record<string, string> = {
  handout: "Handout",
  book: "Book",
  guide: "Facilitator's Guide",
  keynote: "Keynote",
  video: "Video",
  companion: "Companion Guide",
};

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: LABELS[kind] ? `${LABELS[kind]} · RunFree Portal` : "RunFree Portal" };
}

export default function OpenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
