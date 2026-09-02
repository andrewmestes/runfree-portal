import Image from "next/image";

/**
 * Unlike the CVF portal this was forked from, there's no licensed-materials
 * notice here — a project's content belongs to that engagement, not to a
 * certification programme, so there's no blanket usage grant to state.
 */
export default function PortalFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Out to the marketing site, not back into the portal — someone
              clicking a logo in a footer is looking for the company, and the
              portal's own way home is the mark in the header. New tab, so a
              church team mid-session is not navigated out of their project. */}
          <a
            href="https://runfree.co"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RunFree — visit runfree.co"
            className="inline-flex rounded-md outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-runfree-magenta focus-visible:ring-offset-2"
          >
            <Image
              src="/brand/runfree-logo.png"
              alt="RunFree"
              width={120}
              height={30}
              className="h-7 w-auto"
            />
          </a>
          <p className="text-xs leading-relaxed text-gray-500">
            &copy; {year} RunFree. All rights reserved.
          </p>
        </div>

        <p className="mt-6 border-t border-gray-100 pt-6 text-xs text-gray-500">
          <a href="/help" className="inline-block py-1.5 font-medium text-runfree-magentaDeep hover:underline">
            Help &amp; FAQ
          </a>
          {" · "}
          {/* Reachable without signing in — Google's OAuth reviewer checks
              these while logged out, and someone deciding whether to accept an
              invitation should be able to read them first. */}
          <a href="/privacy" className="inline-block py-1.5 font-medium text-runfree-magentaDeep hover:underline">
            Privacy
          </a>
          {" · "}
          <a href="/terms" className="inline-block py-1.5 font-medium text-runfree-magentaDeep hover:underline">
            Terms
          </a>
          {" · "}
          Questions?{" "}
          <a
            href="mailto:andrew@runfree.co"
            className="font-medium text-runfree-magentaDeep hover:underline"
          >
            andrew@runfree.co
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
