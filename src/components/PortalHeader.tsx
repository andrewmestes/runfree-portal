"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Profile = { full_name?: string | null; is_staff?: boolean } | null;

type Props = {
  profile?: Profile | null;
  /**
   * The certification pages came over from the CVF portal during the merge
   * still passing a `framer` row rather than a profile. Rather than rewrite
   * five pages, the header accepts either and normalises — one name and one
   * admin flag is all it ever needed from them.
   */
  framer?: { name?: string; is_admin?: boolean } | null;
  onSignOut: () => void;
  title: string;
  subtitle?: string;
  /** Small line above the title — used for the personal greeting on the home page. */
  eyebrow?: string;
  /** Where the "back" affordance points, if this isn't the top-level page. */
  backHref?: string;
  backLabel?: string;
  /**
   * False on pages that open with their own hero — the project page leads
   * with the church's name and mark, and a second title block above it would
   * say the same thing twice in a smaller font.
   */
  showTitleBlock?: boolean;
  /**
   * Shows the switch across to the Certified Vision Framers portal. Andrew:
   * "Since I would be somebody who's in a project, also an admin, also
   * needing access to the Certified Vision Framers content, I want you to
   * maybe easily show how I might switch between each individual section."
   * Hidden for church clients, who have no login over there.
   */
  certificationAccess?: boolean;
  /** CVF pages pass this; the merged header shows no separate mark. */
  badge?: boolean;
};


/**
 * The certification surface, now in this app. Andrew, on where someone with
 * both kinds of access should land: "let's land on the projects page first."
 * So projects stay the root and these sit alongside it, rather than the old
 * arrangement where certification was a separate deployment behind a ↗.
 */
/** "Andrew Estes" -> "AE". Empty for a profile with no name yet. */
function initialsOf(name?: string | null): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const CERT_LINKS: { href: string; label: string; title?: string }[] = [
  { href: "/resources", label: "Handouts" },
  { href: "/videos", label: "Videos" },
  { href: "/books", label: "Books" },
  { href: "/guide", label: "Guide", title: "Digital Facilitator's Guide" },
];

export default function PortalHeader({
  profile,
  framer,
  onSignOut,
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel,
  showTitleBlock = true,
  certificationAccess = false,
}: Props) {
  // One shape from here down, whichever prop the caller used.
  const person = profile ?? (framer ? { full_name: framer.name ?? null, is_staff: !!framer.is_admin } : null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);

  // Escape closes it, matching every other dismissible surface in the portal.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="bg-runfree-navy">
      {/* Brand bar */}
      <div className="h-1.5 bg-runfree-grad" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-x-8 border-b border-white/10 py-3 sm:py-4">
          <a href="/" className="flex shrink-0 items-center">
            <Image
              src="/brand/runfree-logo-white.png"
              alt="RunFree"
              width={200}
              height={88}
              priority
              className="h-8 w-auto"
            />
          </a>

          {/* Everything lives on the right. A single "HOME" floating in the
              middle of an otherwise empty bar read as a mistake — and the
              logo already goes home, which is what people try first. Back
              links stay, because those are contextual and genuinely needed. */}
          <div className="ml-auto hidden shrink-0 items-center gap-4 text-sm sm:flex">
            {/* One door, not four. Handouts / Videos / Books / Guide sat flat
                beside Help and Admin, so nothing said they were a different
                thing — and a coach inside a project could not tell the
                certification library from the project's own navigation.
                Andrew: "I wanna make sure that we have a very clear and
                distinct certification side of things where I can very clearly
                understand if I am a certified person, click here."

                It is a menu rather than a page because these four are the
                whole surface; a landing page in front of them would be one
                more click to the same links. */}
            {certificationAccess && (
              <div className="relative">
                <button
                  onClick={() => setCertOpen((v) => !v)}
                  aria-expanded={certOpen}
                  aria-haspopup="true"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white outline-none ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-runfree-pink">
                    <circle cx="12" cy="9" r="5" />
                    <path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5" />
                  </svg>
                  Certification
                  <span aria-hidden className={`transition-transform ${certOpen ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>

                {certOpen && (
                  <>
                    {/* Click-away. Invisible, behind the menu, above the page. */}
                    <button
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setCertOpen(false)}
                      className="fixed inset-0 z-40 cursor-default"
                    />
                    <div className="animate-fade absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
                      <p className="border-b border-gray-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Certified Vision Framers
                      </p>
                      {CERT_LINKS.map((l) => (
                        <a
                          key={l.href}
                          href={l.href}
                          onClick={() => setCertOpen(false)}
                          className="block px-4 py-2.5 text-sm font-semibold text-runfree-ink outline-none transition hover:bg-runfree-pink hover:text-runfree-magentaDeep focus-visible:bg-runfree-pink"
                        >
                          {l.label}
                          {l.title && (
                            <span className="block text-[11px] font-normal text-gray-500">
                              {l.title}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <a
              href="/help"
              className="text-xs font-bold uppercase tracking-wider text-white/70 transition hover:text-white"
            >
              Help
            </a>
            {person?.is_staff && (
              <a
                href="/admin"
                className="text-xs font-bold uppercase tracking-wider text-runfree-pink transition hover:text-white"
              >
                Admin
              </a>
            )}

            {/* One control for "me": the name, the account page and signing
                out. They were three separate items in the bar, which is what
                made it read as a row of unrelated links. The name is also now
                a route to somewhere — /account existed but nothing linked to
                it. */}
            <div className="relative">
              <button
                onClick={() => setMeOpen((v) => !v)}
                aria-expanded={meOpen}
                aria-haspopup="true"
                aria-label="Your account"
                className="flex items-center gap-2 rounded-full p-0.5 pr-2 outline-none ring-1 ring-white/20 transition hover:ring-white/50 focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-runfree-grad text-xs font-bold text-white">
                  {initialsOf(person?.full_name) || "?"}
                </span>
                <span aria-hidden className={`text-[10px] text-white/70 transition-transform ${meOpen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>

              {meOpen && (
                <>
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setMeOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="animate-fade absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
                    <a
                      href="/account"
                      onClick={() => setMeOpen(false)}
                      className="block border-b border-gray-100 px-4 py-3 outline-none transition hover:bg-runfree-pink focus-visible:bg-runfree-pink"
                    >
                      <span className="block text-sm font-bold text-runfree-ink">
                        {person?.full_name || "Your account"}
                      </span>
                      <span className="block text-[11px] text-gray-500">
                        View and edit your details
                      </span>
                    </a>
                    <button
                      onClick={() => {
                        setMeOpen(false);
                        onSignOut();
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-runfree-ink outline-none transition hover:bg-gray-50 focus-visible:bg-gray-50"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 44px square: Apple's minimum comfortable tap target. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="portal-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-white outline-none ring-white/25 transition hover:bg-white/10 focus-visible:ring-2 sm:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Expands in place rather than covering the page. */}
        {menuOpen && (
          <nav
            id="portal-mobile-menu"
            className="animate-fade border-b border-white/10 py-2 sm:hidden"
          >
            {backHref && (
              <a
                href={backHref}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-2 py-3 text-sm font-bold uppercase tracking-wider text-white/80 outline-none ring-white/25 transition hover:bg-white/10 hover:text-white focus-visible:ring-2"
              >
                ← {backLabel || "Back"}
              </a>
            )}

            <div className="my-2 border-t border-white/10" />

            {certificationAccess && (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-runfree-pink">
                  Certification
                </p>
                {CERT_LINKS.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-bold uppercase tracking-wider text-white/80 outline-none ring-white/25 transition hover:bg-white/10 focus-visible:ring-2"
                  >
                    {l.label}
                  </a>
                ))}
                <div className="my-2 border-t border-white/10" />
              </>
            )}

            <a
              href="/help"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-bold uppercase tracking-wider text-white/80 outline-none ring-white/25 transition hover:bg-white/10 focus-visible:ring-2"
            >
              Help
            </a>

            {person?.is_staff && (
              <a
                href="/admin"
                onClick={() => setMenuOpen(false)}
                /* min-h keeps this at a comfortable tap size. */
                className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-bold uppercase tracking-wider text-runfree-pink outline-none ring-white/25 transition hover:bg-white/10 focus-visible:ring-2"
              >
                Admin
              </a>
            )}

            <button
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              className="mt-1 block w-full rounded-lg px-2 py-3 text-left text-sm font-medium text-white/80 outline-none ring-white/25 transition hover:bg-white/10 hover:text-white focus-visible:ring-2"
            >
              Sign out
            </button>
          </nav>
        )}

      </div>

      {/* Back sits on its own line, below the bar and hard left.
          Andrew: "Maybe a different place for Your Projects? not sure if that
          should be tucked under a profile submenu, or removed from the header
          and put directly underneath it on the top left."

          Not the profile menu: this is where you ARE, not who you are, and a
          way back that takes two clicks and a guess is not a way back. On its
          own line it reads as a breadcrumb, which is what it always was — and
          the bar above it is left with three things instead of six. */}
      {backHref && (
        <div className="border-b border-white/10 bg-runfree-navy">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <a
              href={backHref}
              className="inline-flex items-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              <span aria-hidden>←</span>
              {backLabel || "Back"}
            </a>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Not rendered at all when the page has its own hero. Hiding it with
            a class still left an empty <h1> in the accessibility tree, so the
            project page announced two headings — one of them blank — and its
            real title was an h1 sitting below a hidden one. */}
        {showTitleBlock && (
        <div className="flex flex-wrap items-center justify-between gap-6 py-6 sm:py-7">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-pink">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 max-w-xl text-white/70">{subtitle}</p>
            )}
          </div>
        </div>
        )}
      </div>
    </header>
  );
}
