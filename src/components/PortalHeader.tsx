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
 * Where the certification portal lives. Env var so this follows the domain
 * cutover to certified.runfree.co without a code change; the fallback is the
 * URL that works today.
 */
const CVF_URL =
  process.env.NEXT_PUBLIC_CVF_PORTAL_URL ||
  "https://certified-vision-framers-portal-pearl.vercel.app";

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
            {backHref && (
              <a
                href={backHref}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/70 transition hover:text-white"
              >
                <span aria-hidden>←</span>
                {backLabel || "Back"}
              </a>
            )}
            {certificationAccess && (
              <a
                href={CVF_URL}
                className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white/70 ring-1 ring-white/20 transition hover:text-white hover:ring-white/40"
                title="Switch to the Certified Vision Framers portal"
              >
                Certification
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  ↗
                </span>
              </a>
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
            {person?.full_name && (
              <span className="font-medium text-white/60">{person?.full_name}</span>
            )}
            <button
              onClick={onSignOut}
              className="rounded-lg px-3 py-1.5 font-medium text-white/80 outline-none ring-1 ring-white/25 transition hover:text-white hover:ring-white/50 focus-visible:ring-2 focus-visible:ring-white"
            >
              Sign out
            </button>
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
              <a
                href={CVF_URL}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-bold uppercase tracking-wider text-white/80 outline-none ring-white/25 transition hover:bg-white/10 focus-visible:ring-2"
              >
                Certification portal
                <span aria-hidden>↗</span>
              </a>
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
