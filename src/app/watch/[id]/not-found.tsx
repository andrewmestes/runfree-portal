import Image from "next/image";

/**
 * What a client sees when a /watch link no longer opens — the row was
 * unpublished, or re-pointed at an address that does not embed (see
 * loadVideo in ./page.tsx). Every link a framer has already texted or
 * emailed ends here the day that happens, and Next's own 404 is a white
 * page with no RunFree mark on it: a pastor still being courted reads that
 * as a broken or suspicious link. So it keeps the watch page's frame and
 * says what to do next. The status stays 404; only the body is ours.
 */
export default function WatchNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-runfree-navy">
      <div className="h-1.5 bg-runfree-grad" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <a href="https://runfree.co" target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
          <Image src="/brand/runfree-logo-white.png" alt="RunFree" width={200} height={88} priority className="h-8 w-auto" />
        </a>
        <Image src="/brand/pivvot-badge-white.svg" alt="Pivvot Vision Framing" width={96} height={64} className="h-12 w-auto opacity-90" />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-pink/90">Pivvot Vision Framing</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl" style={{ textWrap: "balance" }}>
            This video isn&rsquo;t available any more
          </h1>
          <p className="mt-3 text-base leading-relaxed text-white/75" style={{ textWrap: "balance" }}>
            The link may have changed. Ask the person who sent it to you for a fresh one.
          </p>
          <a
            href="https://runfree.co"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-block text-sm font-semibold text-runfree-pink underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white"
          >
            Visit runfree.co
          </a>
        </div>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-white/50 sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} RunFree. All rights reserved.</span>
          <a href="https://runfree.co" target="_blank" rel="noopener noreferrer" className="transition hover:text-white">
            runfree.co
          </a>
        </div>
      </footer>
    </div>
  );
}
