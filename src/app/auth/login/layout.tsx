import type { Metadata } from "next";

/**
 * Let crawlers read the sign-in page.
 *
 * The root layout sets `robots: { index: false, follow: false }` across the
 * whole app, which is right for a private portal — no church's project should
 * ever appear in a search result. But it also applied to this page, and this
 * page is the one Google is given as the application home page for OAuth
 * brand verification.
 *
 * Google's verification crawler honours the directive, so it could not read
 * the page at all — and reported exactly that: "your home page does not
 * explain the purpose of your app", plus an app-name mismatch it had no way
 * to check. Two rejections, one cause.
 *
 * Only this page, /privacy and /terms are opened up. Everything behind
 * sign-in stays noindex.
 */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
