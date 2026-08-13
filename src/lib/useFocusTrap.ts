"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keyboard containment for a modal dialog.
 *
 * Three things a dialog owes a keyboard or screen-reader user, none of which
 * come free:
 *
 *   - focus starts inside it, not wherever it happened to be;
 *   - Tab cycles within it, instead of walking through the page behind — links
 *     they cannot see, in a dialog nothing announced;
 *   - focus returns to whatever opened it, so closing a preview doesn't dump
 *     them at the top of a long list.
 *
 * Escape is handled here too, so a caller gets the whole contract in one line
 * rather than remembering four.
 *
 * Pair with role="dialog", aria-modal="true", aria-labelledby, and tabIndex={-1}
 * on the same element the ref points at.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true
) {
  useEffect(() => {
    if (!active) return;

    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;

    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
        ) ?? []
        // offsetParent is null for display:none; iframes report it that way
        // too even when visible, so they are kept explicitly.
      ).filter((el) => el.offsetParent !== null || el.tagName === "IFRAME");

    (focusable()[0] ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement as HTMLElement | null;
      const outside = !dialog?.contains(at);

      if (e.shiftKey && (at === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [ref, onClose, active]);
}
