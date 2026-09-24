"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * "Start here" — the first week for a newly certified framer, on the hub.
 *
 * Andrew picked it from the September review's ideas ("a 'Start here' path
 * for new framers") after the North Carolina cohort arrived with hub access
 * and nothing that said where to begin. Six steps, each a link to the exact
 * place, ticked off as they go. The same six are in Help ("Start here: your
 * first week"), so a framer who hid the card can still find them.
 *
 * Progress is kept in this browser (localStorage), not the database: it is a
 * convenience checklist, not a record anyone else needs, and a framer who
 * opens the portal on a second device simply sees the steps again.
 */

type Step = {
  key: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
};

const STORAGE_KEY = "runfree.startHere.v1";

const baseSteps: Step[] = [
  {
    key: "companion",
    title: "Read the Certification Companion Guide, pages 3–10",
    detail: "Will's orientation to how you'll learn Pivvot Vision Framing. Read it before session one.",
    href: "/open/companion/current",
    cta: "Open the Companion Guide",
  },
  {
    key: "guide",
    title: "Get to know the Digital Facilitator's Guide",
    detail: "The playbook you facilitate from, laid out by tool number. Its icons open handouts and videos right here in the portal.",
    href: "/guide",
    cta: "Open the Guide",
  },
  {
    key: "orientation",
    title: "Watch the Orientation videos",
    detail: "The Future Church “Ted Talk”, the Process Overview and the 7 Laws Overview — the same films your clients will see.",
    href: "/videos",
    cta: "Go to Client Videos",
  },
  {
    key: "tour",
    title: "Know where everything lives",
    detail: "Handouts by module. Training Videos has two tabs: Client Videos to share, and Facilitator Training for you. Books and Keynotes have their own pages.",
    href: "/videos?tab=facilitators",
    cta: "See Facilitator Training",
  },
  {
    key: "share",
    title: "Share a video with a client",
    detail: "Every client video has a Copy link that opens without a sign-in, and each module can copy its whole list at once.",
    href: "/videos",
    cta: "Try Copy link",
  },
  {
    key: "prep",
    title: "Prepare for your first session",
    detail: "Start with the Preparation Checklist.",
    href: "/resources",
    cta: "Open the checklist",
  },
];

type Saved = { done: string[]; hidden: boolean };

function readSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { done: [], hidden: false };
    const v = JSON.parse(raw);
    return { done: Array.isArray(v.done) ? v.done : [], hidden: Boolean(v.hidden) };
  } catch {
    return { done: [], hidden: false };
  }
}

function writeSaved(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode: the checklist still works for this visit.
  }
}

export default function StartHere() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [steps, setSteps] = useState(baseSteps);

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  // Point the last step at the Preparation Checklist itself when the library
  // has one; the hub has already asked for the listing, so this is usually
  // answered from the browser's copy. Falls back to the Handouts page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch("/api/library", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { modules?: { files: { id: string; title: string }[] }[] };
        const hit = (body.modules ?? [])
          .flatMap((m) => m.files)
          .find((f) => /preparation checklist/i.test(f.title));
        if (hit && !cancelled) {
          setSteps((prev) =>
            prev.map((s) => (s.key === "prep" ? { ...s, href: `/open/handout/${hit.id}` } : s))
          );
        }
      } catch {
        // Keep the Handouts page link.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!saved) return null;

  const update = (next: Saved) => {
    setSaved(next);
    writeSaved(next);
  };
  const toggle = (key: string) =>
    update({
      ...saved,
      done: saved.done.includes(key) ? saved.done.filter((k) => k !== key) : [...saved.done, key],
    });
  const markDone = (key: string) => {
    if (!saved.done.includes(key)) update({ ...saved, done: [...saved.done, key] });
  };

  const doneCount = steps.filter((s) => saved.done.includes(s.key)).length;

  if (saved.hidden) {
    return (
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => update({ ...saved, hidden: false })}
          className="text-sm font-medium text-runfree-magentaDeep hover:underline"
        >
          Show the Start here steps
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="start-here-title"
      className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
    >
      <div className="h-1 bg-runfree-grad" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">
              New here?
            </p>
            <h2 id="start-here-title" className="mt-1 font-display text-xl font-bold text-runfree-ink">
              Start here
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Your first week as a Certified Vision Framer, in six steps.{" "}
              <span className="font-semibold text-runfree-ink">
                {doneCount} of {steps.length} done
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => update({ ...saved, hidden: true })}
            className="min-h-[40px] rounded-lg px-3 text-sm font-medium text-gray-500 transition hover:text-runfree-magentaDeep"
          >
            {doneCount === steps.length ? "Done — hide" : "Hide"}
          </button>
        </div>

        <ol className="mt-5 grid gap-3 md:grid-cols-2">
          {steps.map((s, i) => {
            const done = saved.done.includes(s.key);
            return (
              <li
                key={s.key}
                className={`flex gap-3 rounded-xl p-3 ring-1 transition ${
                  done ? "bg-gray-50 ring-gray-100" : "bg-white ring-gray-200"
                }`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`${s.title} — ${done ? "done" : "not done"}`}
                  onClick={() => toggle(s.key)}
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    done
                      ? "bg-runfree-grad text-white"
                      : "bg-runfree-pink text-runfree-magentaDeep hover:bg-runfree-magenta hover:text-white"
                  }`}
                >
                  {done ? (
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </button>
                <div className="min-w-0">
                  <p className={`font-display text-[15px] font-semibold leading-snug ${done ? "text-gray-500" : "text-runfree-ink"}`}>
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-gray-600">{s.detail}</p>
                  <a
                    href={s.href}
                    onClick={() => markDone(s.key)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-runfree-magentaDeep hover:underline"
                  >
                    {s.cta} <span aria-hidden="true">→</span>
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
