"use client";

import { useEffect, useRef, useState } from "react";
import { RAG_DOT, RAG_LABEL, type RagStatus } from "@/lib/execution";

/**
 * The small pieces every part of Execution uses.
 *
 * Extracted when the panel passed a thousand lines and grew four detail
 * views. Kept in ONE file rather than one-per-component for the reason
 * `PanelRail`/`PanelStrip` is a cautionary tale in CLAUDE.md: two copies of a
 * traffic light drift, and then only one of them gets the bigger tap target.
 */

/** Local calendar date, not UTC — a US evening is already tomorrow in UTC. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** True when `by_when` holds a real date rather than a cadence like "Monthly". */
export function isDateish(v: string | null | undefined): boolean {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/*
 * ---------------------------------------------------------------------------
 * The visual language (the September 2026 refresh).
 *
 * Andrew: "the execution tab is functionally great, however, the user
 * interface and visual feels a little dated." Three directions were drawn up
 * and judged from three seats — a church lead team running the Tuesday
 * meeting off a TV, a product designer, and whoever maintains this — and the
 * one all three picked puts the board in RunFree's own colours: one light
 * shape everywhere, always with its word, and fewer small-caps voices.
 * The spec is docs/design/execution-redesign-spec.md.
 *
 * Everything below lives here, not beside its first caller, for the reason at
 * the top of this file: a second traffic light drifts.
 * ---------------------------------------------------------------------------
 */

/** A status typeset as a word. Local, so lib/execution stays untouched. */
export const STATUS_TEXT: Record<RagStatus, string> = {
  green: "text-emerald-800",
  amber: "text-amber-800",
  red: "text-rose-700",
};

/**
 * The portal's pink call to action, as a class string.
 *
 * `rounded-lg`, so the coarse-pointer rule in globals.css (which grows only
 * the tiny unrounded text buttons) skips it — the `py-2` is what makes it a
 * thumb-sized target instead.
 */
export const PINK_BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-runfree-pink px-3.5 py-2 text-xs font-bold text-runfree-magentaDeep transition-colors hover:bg-runfree-magenta hover:text-white disabled:opacity-50";

export type IconName =
  | "telescope"
  | "flag"
  | "target"
  | "footprints"
  | "pin"
  | "user"
  | "users"
  | "calendar"
  | "check"
  | "check-square"
  | "message"
  | "book"
  | "chart"
  | "clipboard"
  | "chevron-down"
  | "x"
  | "plus";

/** Stroke-only glyphs, drawn from plain geometry so they inherit the text colour. */
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  telescope: (
    <>
      <path d="M3 13l12-6 2 4-12 6z" />
      <path d="M15 7l3-1.5 2 4-3 1.5" />
      <path d="M9 16l-3 5M11 15l3 6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  footprints: (
    <>
      <path d="M7 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z" />
      <path d="M5 16h4v2a2 2 0 0 1-4 0z" />
      <path d="M17 7c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z" />
      <path d="M15 20h4v1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20a7 7 0 0 1 14 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  "check-square": (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  message: <path d="M4 5h16v11H9l-5 4z" />,
  book: (
    <>
      <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
      <path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 15l4-4 3 3 5-6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
    </>
  ),
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/**
 * The one shape a light takes on this tab: a rounded tile.
 *
 * It is God Dreams' mosaic — the same tile the StepStrip, the TrendStrip and
 * the Mid-Ground gauge are made of — so the board speaks one progress
 * language instead of LEDs in one place and bars in another. It carries its
 * word for a screen reader unless `labelHidden`, which is for the places a
 * visible `StatusWord` already says it (so it is not announced twice).
 */
export function StatusMark({
  status,
  size = "md",
  className = "",
  labelHidden = false,
}: {
  status: RagStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
  labelHidden?: boolean;
}) {
  const s = {
    sm: "h-2.5 w-2.5 rounded-[3px]",
    md: "h-3.5 w-3.5 rounded-[4px]",
    lg: "h-[18px] w-[18px] rounded-[5px]",
  }[size];
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      <span
        aria-hidden
        className={`${s} block ${RAG_DOT[status]} shadow-[inset_0_-2px_0_rgba(0,0,0,.14)]`}
      />
      {!labelHidden && <span className="sr-only">{RAG_LABEL[status]}</span>}
    </span>
  );
}

/**
 * The light's word, visible.
 *
 * The meeting this tab exists for is run off a TV across a room, where a
 * coloured square alone is a guess — and for anyone who does not see red and
 * green apart, it was never anything else.
 */
export function StatusWord({ status, size = "sm" }: { status: RagStatus; size?: "xs" | "sm" }) {
  return (
    <span className={`${size === "xs" ? "text-xs" : "text-sm"} font-semibold ${STATUS_TEXT[status]}`}>
      {RAG_LABEL[status]}
    </span>
  );
}

/**
 * The number on a box. Callers add the sr-only "Objective n." text.
 *
 * `amber` is for an initiative nobody has checked in on for a fortnight — a
 * church lead team asked for staleness that shows from across the room, and
 * this does it without adding another pill to a card that already has two.
 */
export function NumberDisc({ n, tone = "navy" }: { n: number; tone?: "navy" | "amber" }) {
  return (
    <span
      aria-hidden
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${
        tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-runfree-indigo text-runfree-navy"
      }`}
    >
      {n}
    </span>
  );
}

/**
 * A section heading inside a detail view.
 *
 * `as="span"` for the one place it sits inside a button (the plan's fold),
 * where a heading element would be invalid.
 */
export function SubHeading({
  icon,
  children,
  count,
  aside,
  as = "h4",
}: {
  icon: IconName;
  children: React.ReactNode;
  count?: number;
  aside?: React.ReactNode;
  as?: "h4" | "span";
}) {
  const T = as;
  const W = as === "span" ? "span" : "div";
  return (
    <W className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <T className="flex items-center gap-2 font-display text-sm font-extrabold tracking-tight text-runfree-ink">
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-md bg-runfree-indigo text-runfree-navy"
        >
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        {children}
        {count != null && (
          <span className="font-sans text-xs font-semibold tabular-nums text-gray-500">{count}</span>
        )}
      </T>
      {aside}
    </W>
  );
}

/**
 * The one small field/column caption voice on the tab.
 *
 * `tone` replaces the grey — the rail sets white or navy on its own ground —
 * rather than being appended to it, so two colour classes never race in the
 * stylesheet.
 */
export function Label({
  children,
  className = "",
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: string;
}) {
  return (
    <span
      className={`block text-[10px] font-semibold uppercase tracking-wide ${tone ?? "text-gray-500"} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A select without the operating system's chevron.
 *
 * The native arrow is a different shape and weight on every platform, and on
 * a row of quiet inline controls it was the one loud thing. `dense` is the
 * small size — not `size`, which is a native attribute of <select>.
 */
export function Select({
  className = "",
  dense = false,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { dense?: boolean }) {
  return (
    <span className="relative inline-block min-w-0 max-w-full">
      <select
        {...props}
        className={`w-full appearance-none rounded-md border border-transparent bg-transparent py-1 pl-1.5 ${
          props.disabled ? "pr-1.5" : "pr-6"
        } ${dense ? "text-xs" : "text-sm"} text-runfree-ink outline-none transition hover:border-gray-200 focus:border-runfree-magenta focus:bg-white disabled:cursor-default disabled:hover:border-transparent ${className}`}
      />
      {!props.disabled && (
        <Icon
          name="chevron-down"
          className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400"
        />
      )}
    </span>
  );
}

/**
 * The sheet's three lights.
 *
 * Not one button that cycles: the printed Action Step List shows all three
 * states with one filled, and a cycling control hides the two you are not on
 * — which matters when someone is reading the screen over a shoulder and
 * needs to see that green was a choice among three.
 *
 * The tile is 14px; the thing you tap is 28. A small target is about a third
 * of what a thumb hits reliably, and this gets used standing up in a room.
 *
 * `quiet` fades the two unchosen options until the row is hovered or focused
 * (always shown on a touch screen, where there is no hover). A table of steps
 * with three circles per row was a wall of dots.
 *
 * A reader cannot change a light, so a reader is shown the light — one tile,
 * labelled — rather than a radio group with nothing selectable in it.
 */
export function RagPicker({
  value,
  onChange,
  disabled,
  quiet = false,
  label = "Today's status",
}: {
  /** null = not yet judged; every option renders empty. */
  value: RagStatus | null;
  onChange: (s: RagStatus) => void;
  disabled?: boolean;
  quiet?: boolean;
  /** The group's accessible name — "Step 3 light", "Attendance light". */
  label?: string;
}) {
  const options: RagStatus[] = ["red", "amber", "green"];

  if (disabled) {
    return value ? (
      <span role="img" aria-label={RAG_LABEL[value]} title={RAG_LABEL[value]} className="grid h-7 w-7 place-items-center">
        <StatusMark status={value} size="md" labelHidden />
      </span>
    ) : (
      <span role="img" aria-label="No status yet" className="grid h-7 w-7 place-items-center">
        <span aria-hidden className="block h-3.5 w-3.5 rounded-[4px] bg-white ring-1 ring-gray-300" />
      </span>
    );
  }

  // One tab stop for the group, arrows to move — the radio contract. Every
  // circle was its own tab stop and the arrows did nothing, which is three
  // presses per row for a keyboard user and a lie to a screen reader.
  const tabbable = value ?? options[0];
  return (
    <span className="group/rag inline-flex items-center" role="radiogroup" aria-label={label}>
      {options.map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={RAG_LABEL[s]}
            title={RAG_LABEL[s]}
            tabIndex={s === tabbable ? 0 : -1}
            data-rag={s}
            onClick={(e) => {
              e.stopPropagation();
              onChange(s);
            }}
            onKeyDown={(e) => {
              const i = options.indexOf(s);
              let next: RagStatus | null = null;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") next = options[(i + 1) % options.length];
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = options[(i + options.length - 1) % options.length];
              if (e.key === "Home") next = options[0];
              if (e.key === "End") next = options[options.length - 1];
              if (!next) return;
              e.preventDefault();
              onChange(next);
              (e.currentTarget.parentElement?.querySelector(`[data-rag="${next}"]`) as HTMLElement | null)?.focus();
            }}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-full"
          >
            {on ? (
              <StatusMark status={s} size="md" labelHidden />
            ) : (
              <span
                aria-hidden
                className={`block h-3 w-3 rounded-[3px] bg-white ring-1 ring-gray-300 transition-opacity ${
                  quiet
                    ? "opacity-40 group-hover/rag:opacity-100 group-focus-within/rag:opacity-100 [@media(pointer:coarse)]:opacity-100"
                    : ""
                }`}
              />
            )}
          </button>
        );
      })}
    </span>
  );
}

/**
 * A text field that saves when you leave it, and only if it changed.
 *
 * Save-on-blur rather than debounced-as-you-type: this gets edited live in a
 * review meeting, where a half-typed value flushing to the database and then
 * being corrected produces two writes and a visible flicker on everyone
 * else's screen.
 */
export function Cell({
  value,
  onSave,
  placeholder,
  disabled,
  className = "",
  align = "left",
  display,
  required = false,
  wrap = false,
  ariaLabel,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
  /** How to render read-only. The editable field always shows the raw value. */
  display?: (v: string) => string;
  /**
   * Blank is not a value. The draft snaps back to what was there instead of
   * sitting empty over a row that never saved — a caller that declined the
   * save with `v && …` left the field looking cleared until the next reload.
   */
  required?: boolean;
  /** Read-only text wraps instead of truncating — a step description is a sentence. */
  wrap?: boolean;
  /** For inputs whose visible caption is not a <label> (column headings, MiniField). */
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  /**
   * Editing shows the raw string; resting shows `display`.
   *
   * Without this an editor stared at "2026-08-19" in the By column while a
   * viewer saw "Aug 19, 2026" — the raw form is what you have to edit, but it
   * is not what anyone wants to read for the other 99% of the time the field
   * is sitting there.
   */
  const [focused, setFocused] = useState(false);
  const discard = useRef(false);
  useEffect(() => setDraft(value ?? ""), [value]);

  if (disabled) {
    return (
      <span
        className={`block text-sm text-gray-600 ${wrap ? "whitespace-normal break-words" : "truncate"} ${align === "right" ? "text-right" : ""} ${className}`}
      >
        {value ? (display ? display(value) : value) : <span className="text-gray-300">—</span>}
      </span>
    );
  }

  return (
    <input
      value={!focused && display && draft ? display(draft) : draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (discard.current) {
          discard.current = false;
          return;
        }
        const next = draft.trim() === "" ? null : draft.trim();
        if (required && next === null) {
          setDraft(value ?? "");
          return;
        }
        if ((value ?? null) !== next) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          // Discard, then blur. setState is asynchronous but blur() fires
          // onBlur synchronously, so the old order — reset, then blur — ran
          // the save with the abandoned draft still in scope and committed
          // exactly the edit Escape was meant to throw away. The ref makes
          // the blur handler skip the save this once.
          discard.current = true;
          setDraft(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-runfree-ink outline-none transition placeholder:text-gray-300 hover:border-gray-200 focus:border-runfree-magenta focus:bg-white ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    />
  );
}

/**
 * A date that reads as a date until you mean to change it.
 *
 * A native date input shows "mm/dd/yyyy" and a calendar glyph even when
 * nothing is being edited, which is the browser's furniture sitting in the
 * middle of a church's sheet. At rest this is the same "Aug 1, 2026" a reader
 * sees; a click (or Enter) swaps in the native input and asks it to open.
 */
export function DateCell({
  value,
  onSave,
  disabled,
  label,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
  /** Names the control for a screen reader: "Start date", "Next review". */
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) {
      wasEditing.current = true;
      // Chrome, Edge and Safari 16+ open the calendar; older Safari simply
      // leaves the focused input, which is still editable by typing.
      try {
        (inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null)?.showPicker?.();
      } catch {
        /* showPicker throws without a user gesture in some engines */
      }
    } else if (wasEditing.current) {
      wasEditing.current = false;
      restRef.current?.focus();
    }
  }, [editing]);

  // Read-only matches Cell's read-only exactly, so a reader's row of facts
  // lines up: no input padding to reserve when there is no input.
  if (disabled) {
    return (
      <span className="block truncate text-sm text-gray-600">
        {value ? prettyDate(value) : <span className="text-gray-300">—</span>}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        ref={restRef}
        type="button"
        aria-label={`${label ?? "Date"}: ${value ? prettyDate(value) : "not set"}. Edit`}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-left text-sm tabular-nums text-runfree-ink transition hover:border-gray-200"
      >
        {value ? prettyDate(value) : <span className="text-gray-300">—</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="date"
      autoFocus
      defaultValue={value ?? ""}
      aria-label={label ?? "Date"}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value || null;
        if ((value ?? null) !== next) onSave(next);
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          setEditing(false);
        }
      }}
      className="w-full min-w-0 rounded-md border border-runfree-magenta bg-white px-1.5 py-1 text-sm text-runfree-ink outline-none"
    />
  );
}

export function BlockHeading({
  eyebrow,
  title,
  note,
  action,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  /** A control that belongs to the whole block — the Renewal Cycle's unfold. */
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-runfree-magentaDeep">
          {eyebrow}
        </p>
        <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-runfree-ink">
          {title}
        </h3>
        {note && <p className="mt-1 text-sm leading-relaxed text-gray-500">{note}</p>}
      </div>
      {action}
    </header>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

export function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </span>
  );
}

/** Small pill used for initiative type, template group, review cadence. */
export function Chip({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "navy" | "accent";
}) {
  const tones = {
    quiet: "bg-gray-100 text-gray-600",
    navy: "bg-runfree-indigo text-runfree-navy",
    accent: "bg-runfree-pink text-runfree-magentaDeep",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Save / Cancel, and optionally Clear, under an open editor.
 *
 * One component because there are now six places that open a RichText box and
 * six hand-rolled button rows is how the spacing drifts.
 */
export function EditorActions({
  onSave,
  onCancel,
  onClear,
  busy,
}: {
  onSave: () => void;
  onCancel: () => void;
  onClear?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={onSave}
        className="rounded-lg bg-runfree-grad px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-2 text-xs text-gray-500 transition hover:text-runfree-ink"
      >
        Cancel
      </button>
      {onClear && (
        <button
          onClick={onClear}
          className="ml-auto text-xs font-semibold text-gray-400 transition hover:text-rose-600"
        >
          Clear
        </button>
      )}
    </div>
  );
}
