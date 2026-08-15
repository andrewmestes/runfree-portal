"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Profile = { full_name?: string | null; is_staff?: boolean } | null;

export type NavLink = { href: string; label: string; title?: string };

type Props = {
  profile: Profile;
  onSignOut: () => void;
  title: string;
  subtitle?: string;
  /** Small line above the title — used for the personal greeting on the home page. */
  eyebrow?: string;
  /** Where the "back" affordance points, if this isn't the top-level page. */
  backHref?: string;
  backLabel?: string;
  /**
   * Nav links for the current context. Unlike the CVF portal this was
   * forked from — which had one fixed set of links for its one audience —
   * every RunFree user's nav depends on which project they're inside, so
   * the caller supplies it. Defaults to just Home.
   */
  links?: NavLink[];
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
};

/**
 * Where the certification portal lives. Env var so this follows the domain
 * cutover to certified.runfree.co without a code change; the fallback is the
 * URL that works today.
 */
const CVF_URL =
  process.env.NEXT_PUBLIC_CVF_PORTAL_URL ||
  "https://certified-vision-framers-portal-pearl.vercel.app";

const HOME_LINK: NavLink[] = [{ href: "/", label: "Home" }];

export default function PortalHeader({
  profile,
  onSignOut,
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel,
  links,
  showTitleBlock = true,
  certificationAccess = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape closes it, matching every other dismissible surface in the portal.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navLinks = backHref
    ? [{ href: backHref, label: backLabel || "Back" }]
    : links ?? HOME_LINK;

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

          {/* Desktop nav. Below sm it collapses into the menu — a sideways
              scroll strip with hidden scrollbars gave no sign the links past
              the edge existed at all on a phone. */}
          <nav className="hidden flex-1 items-center justify-center gap-x-9 sm:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                title={link.title}
                className="whitespace-nowrap text-sm font-bold uppercase tracking-wider text-white/70 transition hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-4 text-sm sm:flex">
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
            {profile?.is_staff && (
              <a
                href="/admin"
                className="text-xs font-bold uppercase tracking-wider text-runfree-pink transition hover:text-white"
              >
                Admin
              </a>
            )}
            {profile?.full_name && (
              <span className="font-medium text-white/60">{profile.full_name}</span>
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
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-2 py-3 text-sm font-bold uppercase tracking-wider text-white/80 outline-none ring-white/25 transition hover:bg-white/10 hover:text-white focus-visible:ring-2"
              >
                {link.label}
              </a>
            ))}

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

            {profile?.is_staff && (
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

        <div
          className={`flex flex-wrap items-center justify-between gap-6 py-6 sm:py-7 ${
            showTitleBlock ? "" : "hidden"
          }`}
        >
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
      </div>
    </header>
  );
}
