"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, logout, listMyProjects } from "@/lib/auth";
import { listFeedback, resolveFeedback, submitFeedback, type FeedbackKind, type FeedbackRow } from "@/lib/feedback";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import PortalFooter from "@/components/PortalFooter";
import AccessError from "@/components/AccessError";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_staff: boolean;
  is_owner: boolean;
  certification_access: boolean;
};

/**
 * Help, written twice.
 *
 * A church member and a RunFree coach are asking different questions, and a
 * single page answering both would make each of them read past half of it.
 * A client wants "where is the thing I was told about"; a coach wants "how do
 * I set this up without breaking it". Staff see both, because a coach also
 * needs to know what their client is looking at.
 */
export default function HelpPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");
  const [mine, setMine] = useState<FeedbackRow[]>([]);
  /**
   * Help is written for what you can actually reach.
   *
   * Andrew: "if somebody only has certification access and then they click on
   * that help and FAQ button on the bottom, and it gives them answers to how
   * to run all kinds of stuff that they don't have access to, that might not
   * make sense."
   *
   * One page, sections gated — rather than two Help pages, which would need
   * the footer to know which one to link to and would leave anyone holding
   * both kinds of access reading half their answers in each. A framer with no
   * projects gets the certification section and nothing about running an
   * engagement; a church client gets the reverse.
   */
  const [hasProjects, setHasProjects] = useState(false);

  const load = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth/login");
        return;
      }
      setAccessToken(session.access_token);
      const current = (await getCurrentProfile()) as Profile | null;
      if (!current) {
        setStatus("error");
        return;
      }
      setProfile(current);
      try {
        setHasProjects(((await listMyProjects()) ?? []).length > 0);
      } catch {
        // Assume none; the certification section still shows.
      }
      setMine(await listFeedback(session.access_token));
      setStatus("ready");
    } catch (err) {
      console.error("Help load failed:", err);
      setStatus("error");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSignOut() {
    await logout();
    router.replace("/auth/login");
  }

  if (status === "checking") return <PageLoader label="Loading help…" />;
  if (status === "error") return <AccessError onRetry={load} />;
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        backHref="/"
        backLabel="Your projects"
        title="Help"
        subtitle="How this works, and how to reach a person."
        certificationAccess={profile.certification_access || profile.is_staff}
      />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">

        {/* Only for someone who has a project to use. */}
        {(hasProjects || profile.is_staff) && (
        <Section title="Using your portal">
          <Faq q="Where do I find the materials for our next session?">
            A project opens on <strong>Overview</strong>. For the session materials,
            choose <strong>The Process</strong> in the column down the left. The six icons are the six tools of the process — click one and
            everything for it appears underneath: the handouts, the videos to watch
            beforehand, photos from our working sessions, and what that module
            produces. Nothing loads a new page, so you can move between them freely.
            <br />
            <br />
            The work to do before we start has its own section, <strong>Preparation</strong>,
            at the top of that column.
          </Faq>
          <Faq q="What is the dark column down the left?">
            Your way around. The sections of the project sit at the top of it:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Overview</strong> — where you land: what your team owes before we next meet, when that is, and the last session we held.</li>
              <li><strong>Preparation</strong> — what to gather and set up before we begin.</li>
              <li><strong>The Process</strong> — the six tools, with their handouts and videos.</li>
              <li><strong>Team</strong> — your church&rsquo;s team, and the RunFree people working with you.</li>
              <li><strong>Key Dates</strong> — everything already in the diary.</li>
              <li><strong>Session Recordings</strong> — every session we have held, with its recording and the charts from the room.</li>
              <li><strong>Deliverables</strong> — the finished work, in the Vision Stack.</li>
            </ul>
            A project only shows the sections it actually has, so you may see fewer than
            seven. Overview is always there.
            <br />
            <br />
            Underneath them are your other projects — <strong>Starred</strong> first if you
            have starred any, then <strong>All projects</strong> alphabetically. At the very
            bottom, always in view, are Help, Admin if you are RunFree staff, and your own
            account with the way to sign out.
            <br />
            <br />
            <strong>What&rsquo;s Important Now</strong> — the list of what your team owes
            before we next meet — lives on <strong>Overview</strong>, along with the next
            date and the most recent recording. It used to sit above every section, which
            meant the same two cards took up the top of the screen no matter what you had
            come to look at. Everything is one click away in the column instead.
          </Faq>
          <Faq q="How does this work on my phone?">
            The column would leave almost nothing for the content on a narrow screen, so
            it tucks away. Tap the <strong>☰</strong> button at the top left to slide it
            out, and tap anywhere outside it — or the ✕ — to put it back. Choosing a
            section closes it for you.
            <br />
            <br />
            On a phone the drawer is the only way between sections, and that is deliberate:
            seven labels will not fit across a phone screen, so the row we used to show ran
            off the edge and cut the last few in half. Nothing is hidden in the drawer.
            <br />
            <br />
            On a tablet there is room, so the sections also appear as a row of buttons
            beneath the header — wrapping onto a second line rather than scrolling, so you
            can see all of them at once.
          </Faq>
          <Faq q="What is the Vision Stack?">
            It is the finished work — everything your team builds across the whole
            engagement, arranged in four layers from the convictions underneath it all
            up to the tools that put it into practice. It has its own page, linked from
            the top of your project. Items appear there as they are completed, so it
            fills in as you go.
          </Faq>
          <Faq q="Why can I see a session but not its notes?">
            Notes appear once your coach has finished writing them up. Until then the
            session is there but its recap is not — that is deliberate, so you are never
            reading half-written notes.
          </Faq>
          <Faq q="Can I download the handouts?">
            Yes. Each module leads with one combined PDF containing everything for it,
            and the individual sheets are listed underneath if you only want one.
            Clicking one opens it inside the portal, with a <strong>Download</strong>
            button in the corner — so you can read it without losing your place, and
            save or print it when you want to.
          </Faq>
          <Faq q="Who else can see our project?">
            Only the people your church has had added, plus the RunFree team leading
            your engagement. No other church can see any of it, and nothing is public.
            The row of faces at the top of your project is everyone who can sign in —
            click it to see the list.
            <br />
            <br />
            Being on the <em>Church Team</em> list under the Team tab is not the same as
            having a login. That list is names and titles for everyone&rsquo;s reference;
            access is granted separately, one person at a time.
          </Faq>
          <Faq q="I have not received my invitation.">
            Check the spam folder first — the invitation arrives from our sign-in
            system, so it does not always look like it came from a person. If it is not
            there, email Andrew and he can send a fresh one.
          </Faq>
        </Section>

        )}

        {/* The certification half, for anyone who can reach it. */}
        {(profile.certification_access || profile.is_staff) && (
          <Section title="Your certification resources">
            <Faq q="Where is the certification material?">
              <strong>Certification</strong> in the top bar opens the Certified Vision
              Framer Hub. Five cards: Process Handouts, Training Videos, Will&rsquo;s
              Books, the Digital Facilitator&rsquo;s Guide, and Keynotes (coming). Every
              page there carries the Pivvot mark, so you can always tell which part of
              the portal you are in.
            </Faq>
            <Faq q="Finding one particular handout">
              Open <strong>Process Handouts</strong>. The icons across the top are the
              six tools — click one to see only its sheets. There is also a search box
              that looks across every module at once, which is usually faster if you
              know part of the name.
            </Faq>
            <Faq q="Reading and downloading">
              Clicking a handout opens it inside the portal with a{" "}
              <strong>Download</strong> button, so you can read it without leaving the
              page. Each module also has one combined PDF containing all of its sheets —
              useful for printing a full workbook in one go.
            </Faq>
            <Faq q="The material changed and I am seeing the old version">
              The handouts are read live from Google Drive, so an updated file appears
              for everyone as soon as it is replaced there. If something still looks
              stale, <strong>Refresh from Drive</strong> on the Handouts page forces a
              fresh read.
            </Faq>
            <Faq q="What is the difference between this and a church project?">
              The certification library is <em>your</em> material as a facilitator — how
              to run the process. A project is one church&rsquo;s engagement: their dates,
              their sessions, their finished work. If you are running an engagement you
              will have both, and <em>Your projects</em> under the logo moves between
              them.
            </Faq>
          </Section>
        )}

        {profile.is_staff && (
          <Section title="For the RunFree team" tone="staff">
            <Faq q="Starting a new engagement">
              <strong>+ New project</strong> from your projects page. Pick the template
              — Pivvot Vision Framing or Younique — and the project is created with that
              process&rsquo;s handouts, videos and deliverable slots already in place.
              Choose <em>Private</em> unless you specifically want every RunFree staff
              member to see it. You become its admin and its lead navigator; both can be
              changed afterwards.
            </Faq>
            <Faq q="Adding the church's team">
              Two separate things, on purpose.
              <br />
              <br />
              The <strong>roster</strong> — Team tab &rarr; Church Team — is names,
              titles and emails for everyone in the room. Adding someone there sends
              nothing and grants nothing.
              <br />
              <br />
              <strong>Access</strong> is the row of faces at the top of the project, next
              to the logo. Click it, and add someone by email — or use{" "}
              <em>Give access</em> beside anyone already on the roster, which saves
              retyping their address. Give them <em>Viewer</em> unless they need to add
              content. Access levels are per project: someone can be an admin on one
              engagement and have no access to another.
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>Viewer</strong> — reads what has been published. Most church team members.</li>
                <li><strong>Editor</strong> — can add and edit content. For a client leading their own process.</li>
                <li><strong>Admin</strong> — everything an editor can do, plus adding and removing people.</li>
              </ul>
            </Faq>
            <Faq q="After a session">
              Sessions &rarr; <strong>+ Add a session</strong>, or open the existing one.
              Set the date, tag which module it covered, paste the Loom or Zoom link,
              then write the takeaways and the next steps. Drop in photos of any
              flipcharts or screen work — they attach to that session. Nothing is visible
              to the church until you tick <em>Visible to the church team</em>, so you
              can write it up over several sittings.
            </Faq>
            <Faq q="Publishing deliverables">
              Open the Vision Stack from the Deliverables tab and click any empty tile to
              upload the finished PDF or image. Each carries a <em>Draft</em> /{" "}
              <em>Live</em> toggle — the church sees it only once it says Live. Finished
              PDFs that do not belong to a particular tile go in{" "}
              <strong>Final Documents</strong> on the same tab.
              <br />
              <br />
              You will not see &ldquo;3 of 23&rdquo; anywhere. Plenty of engagements run
              part of the process by design, and a total makes a deliberate choice look
              like unfinished work — so the portal counts what is done and never what is
              missing.
            </Faq>
            <Faq q="Keeping your own projects in order">
              The star on each project pins it to the top of your list. It is yours
              alone: what you pin does not change anyone else&rsquo;s list, so two coaches
              sharing an engagement can each keep their own current work at the top.
            </Faq>
            <Faq q="Where handouts come from">
              The standard handouts are read live from Google Drive —
              <em> RunFree Team &rsaquo; Pivvot Vision Framing &rsaquo; Handouts &rsaquo;
              Pivvot Handouts (PDF)</em>. Update a PDF there and every church sees the new
              one immediately; there is nothing to re-upload.
              <br />
              <br />
              Two things worth knowing. Only the <strong>numbered</strong> folders and
              files are picked up — <em>1 - Funnel Fusion</em>, <em>01 - Funnel Fusion
              Handouts.pdf</em> — so a loose file dropped into Combined Handouts will not
              appear. And anything specific to one church does not belong there at all:
              upload it to that church&rsquo;s project instead, which is also what keeps
              one client&rsquo;s name off another client&rsquo;s screen.
            </Faq>
            <Faq q="Where the certification material lives">
              <strong>Certification</strong> in the top bar opens the Certified Vision
              Framer Hub — Process Handouts, Training Videos, Will&rsquo;s Books and the
              Digital Facilitator&rsquo;s Guide. It is a separate section from your
              projects, and the pages there carry the Pivvot mark so you can tell at a
              glance which side of the portal you are on. <em>Your projects</em> under
              the logo brings you back.
              <br />
              <br />
              That material is for facilitators. What a church sees inside its own
              project is a different set — the handouts for the process they are
              actually running.
            </Faq>
            <Faq q="A church that is not doing the standard process">
              Create the project from scratch rather than from a template, and build the
              sections as you go — anywhere you pick a module there is a
              <strong> + New section…</strong> option. That is also how Younique and
              coaching engagements are organised, since they do not use the six Pivvot
              modules.
            </Faq>
            <Faq q="Something looks wrong, or I need it to do something it doesn't">
              Use the form below. It reaches Andrew with your name and which project you
              were on attached, so nothing needs re-explaining.
            </Faq>
          </Section>
        )}

        <FeedbackForm
          profile={profile}
          accessToken={accessToken}
          onSent={load}
        />

        {mine.length > 0 && (
          <FeedbackList
            rows={mine}
            isOwner={profile.is_owner}
            accessToken={accessToken}
            onChanged={load}
          />
        )}
      </main>

      <PortalFooter />
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "staff";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-runfree-ink">
          {title}
        </h2>
        {tone === "staff" && (
          <span className="rounded-full bg-runfree-indigo px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-runfree-navy">
            RunFree only
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        {children}
      </div>
    </section>
  );
}

/** Collapsed by default: a wall of open answers is not a page anyone reads. */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left outline-none transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-runfree-magenta"
      >
        <span className="text-sm font-semibold text-runfree-ink">{q}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="animate-fade px-5 pb-5 text-sm leading-relaxed text-gray-600">{children}</div>
      )}
    </div>
  );
}

const KINDS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: "question", label: "Ask a question", hint: "Something you want explained." },
  {
    value: "problem",
    label: "Technical support",
    hint: "Something is broken or did not do what you expected.",
  },
  {
    value: "idea",
    label: "Suggest an improvement",
    hint: "Something you would like the portal to do.",
  },
];

function FeedbackForm({
  profile,
  accessToken,
  onSent,
}: {
  profile: Profile;
  accessToken: string | null;
  onSent: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>("question");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await submitFeedback(accessToken, {
        profileId: profile.id,
        kind,
        message,
        fromStaff: profile.is_staff,
      });
      setMessage("");
      setSent(true);
      onSent();
    } catch (err) {
      console.error("Feedback failed:", err);
      setError("That did not send. Email andrew@runfree.co instead and it will not be lost.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-extrabold tracking-tight text-runfree-ink">
        Contact us
      </h2>
      <p className="mb-4 mt-1 text-sm text-gray-500">
        Reach us directly at{" "}
        <a href="mailto:andrew@runfree.co" className="font-medium text-runfree-magentaDeep hover:underline">
          andrew@runfree.co
        </a>
        , or send it here.
      </p>

      <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              aria-pressed={kind === k.value}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                kind === k.value
                  ? "bg-runfree-grad text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">{KINDS.find((k) => k.value === kind)?.hint}</p>

        <textarea
          rows={4}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setSent(false);
          }}
          placeholder={
            kind === "problem"
              ? "What were you doing, and what happened instead?"
              : kind === "idea"
                ? "What would you like it to do?"
                : "What would you like to know?"
          }
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-runfree-magenta focus:ring-1 focus:ring-runfree-magenta"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="rounded-lg bg-runfree-grad px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Submit"}
          </button>
          {sent && (
            <p role="status" className="text-sm font-medium text-runfree-magentaDeep">
              Sent to RunFree — thank you.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Sent as {profile.full_name || profile.email}.
        </p>
      </form>
    </section>
  );
}

function FeedbackList({
  rows,
  isOwner,
  accessToken,
  onChanged,
}: {
  rows: FeedbackRow[];
  isOwner: boolean;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const open = rows.filter((r) => !r.resolved_at);
  const done = rows.filter((r) => r.resolved_at);

  return (
    <section className="mt-10">
      <h2 className="mb-4 font-display text-xl font-extrabold tracking-tight text-runfree-ink">
        {isOwner ? "Everything that has come in" : "What you have sent"}
        <span className="ml-2 text-sm font-normal text-gray-400">{open.length} open</span>
      </h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        {[...open, ...done].map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-5 py-4">
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                r.kind === "problem"
                  ? "bg-red-50 text-red-600"
                  : r.kind === "idea"
                    ? "bg-runfree-pink text-runfree-magentaDeep"
                    : "bg-runfree-indigo text-runfree-navy"
              }`}
            >
              {r.kind}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`whitespace-pre-line text-sm ${r.resolved_at ? "text-gray-400 line-through" : "text-gray-700"}`}>
                {r.message}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {new Date(r.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
                {r.from_staff && " · RunFree"}
              </p>
            </div>
            {isOwner && (
              <button
                onClick={async () => {
                  if (!accessToken) return;
                  await resolveFeedback(accessToken, r.id, !r.resolved_at);
                  onChanged();
                }}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-runfree-ink"
              >
                {r.resolved_at ? "Reopen" : "Done"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
