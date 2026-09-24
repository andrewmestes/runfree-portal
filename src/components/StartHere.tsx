"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * "Start here" — the first week for a newly certified framer.
 *
 * Its own page (/certification/start-here), reached from a slim link on the
 * hub: Andrew, 24 Sept — "I don't really want the 'start here' to be the main
 * login page." He also dropped the Orientation-videos step ("those are for
 * clients mainly, not vision framers. they already know the journey").
 *
 * Andrew picked it from the September review's ideas ("a 'Start here' path
 * for new framers") after the North Carolina cohort arrived with hub access
 * and nothing that said where to begin. Five steps, each a link to the exact
 * place, ticked off as they go. Help ("Start here: your first week") links
 * the page, so a framer who hid the hub's link can still find it.
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
    // Andrew: "just give a simple overview of what that is and why it's
    // significant." Every clause is the Companion Guide's own: the DFG is
    // the curriculum and this is how to hold it (p. 4), the postures (p. 7),
    // ten days in three (p. 8), a navigator who cannot get lost rather than
    // coverage (pp. 3, 8, 10), fifteen minutes before session one (p. 2).
    key: "companion",
    title: "Read the Certification Companion Guide, pages 3–10",
    detail:
      "Will Mancini\u2019s short guide to the certification itself. The Digital Facilitator\u2019s Guide is the whole curriculum; this tells you how to hold it: which of the Five Learning Postures you\u2019re here as, and how three days can teach a ten-day process. Why it matters: it sets the week\u2019s goal \u2014 not covering every tool, but leaving as a navigator who can\u2019t get lost in the system. About fifteen minutes, before your cohort\u2019s first session.",
    href: "/open/companion/current",
    cta: "Open the Companion Guide",
  },
  {
    key: "guide",
    title: "Learn how the Digital Facilitator's Guide works",
    detail: "The playbook you facilitate from: a menu, a front and back for almost every tool, and a logo that always takes you back up. A two-minute explainer with pictures.",
    href: "/guide/how-to-use",
    cta: "How to use the Guide",
  },
  {
    key: "tour",
    title: "Know where everything lives",
    detail: "Handouts by module. Training Videos has two tabs: Client Videos to share, and Facilitator Training for you. Books and Keynotes have their own pages.",
    href: "/videos?tab=facilitators",
    cta: "See Facilitator Training",
  },
  {
    // The Video Clips stream from Drive and have no public address yet
    // (shareId in app/videos/page.tsx), so they show no Copy link. Help's
    // "Sharing a video with a client" says the same; if Andrew makes them
    // public, drop the last sentence in both places.
    key: "share",
    title: "Share a video with a client",
    detail: "Every teaching video on Client Videos has a Copy link that opens without a sign-in, and each module can copy its whole list at once. The Video Clips have none for now; play those in the room.",
    href: "/videos",
    cta: "Try Copy link",
  },
  {
    // A client session, not the cohort's: the checklist is addressed to a
    // church (what to send before the first visit, how to set up the room),
    // and step 1's "first session" is the certification's own.
    key: "prep",
    title: "Prepare for your first client session",
    detail: "The Preparation Checklist is what you send a church before the first visit: what they gather for you, and how to set up the room.",
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

export default function StartHereChecklist() {
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

  return (
    <section
      aria-labelledby="start-here-title"
      className="mb-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200"
    >
      <div className="h-1 bg-runfree-grad" />
      <div className="p-5 sm:p-6">
        {/* The page header already says "Your first week as a Certified
            Vision Framer"; this heading only introduces the list. */}
        <div>
          <h2 id="start-here-title" className="font-display text-xl font-bold text-runfree-ink">
            Five steps
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Each one links to the right place. Tick it off as you go.{" "}
            <span className="font-semibold text-runfree-ink">
              {doneCount} of {steps.length} done
            </span>
          </p>
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

/**
 * The hub's one-line door to the checklist — small on purpose, so the hub
 * stays the hub. "Hide" tucks it away in this browser; Help keeps the link.
 */
export function StartHereBanner() {
  const [saved, setSaved] = useState<Saved | null>(null);
  useEffect(() => {
    setSaved(readSaved());
  }, []);
  if (!saved || saved.hidden) return null;
  const done = baseSteps.filter((s) => saved.done.includes(s.key)).length;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200">
      <p className="min-w-0 flex-1 text-sm text-gray-700">
        <span className="font-semibold text-runfree-ink">New here?</span> Your first week, in five steps
        {done > 0 ? ` \u2014 ${done} of ${baseSteps.length} done` : ""}.
      </p>
      <a
        href="/certification/start-here"
        className="inline-flex items-center gap-1 text-sm font-semibold text-runfree-magentaDeep hover:underline"
      >
        Start here <span aria-hidden="true">→</span>
      </a>
      <button
        type="button"
        onClick={() => {
          const next = { ...saved, hidden: true };
          setSaved(next);
          writeSaved(next);
        }}
        aria-label="Hide the Start here link"
        className="min-h-[36px] rounded-lg px-2 text-sm text-gray-500 transition hover:text-runfree-magentaDeep"
      >
        Hide
      </button>
    </div>
  );
}
