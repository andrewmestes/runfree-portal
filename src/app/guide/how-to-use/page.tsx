"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, loginUrlHere, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";

type Framer = { id: string; email: string; name: string; is_admin: boolean };

/**
 * How to use the Digital Facilitator's Guide.
 *
 * Andrew, 24 Sept 2026: "use still shots/thumbnails of the DFG and create a
 * great understanding of the digital card idea of 'front and back' (the idea
 * of part one and part two of the same 'card' of a tool) then also the menus
 * and inter linking use by clicking the logo. just a simple explainer of how
 * to use the document." Linked from the Guide page and from Start here.
 *
 * The stills are pages 2, 3, 89 and 90 of the September 2026 edition, at
 * 960px, in private/guide-howto/ — served only to certified framers through /api/guide-howto/{name}. The numbered markers sit just beside
 * (below, or to the left of) what they point at: the tool number, timer,
 * icons, logo and Tool List lines, measured on the stills and checked against
 * the PDF's own link rectangles. They never sit on top of them, so what they
 * point at stays visible. A marker was once centred on each target and hid
 * the "3.9", the timer, both icons and the logo it was describing. If a new
 * edition moves those, re-render the stills and re-check the percentages at
 * 320px and 640px wide, where a marker is largest against its still.
 */

type Marker = { n: number; x: number; y: number; label: string };

/**
 * The stills are private (they are pages of the guide), so each is fetched
 * with the session from /api/guide-howto/{name} and shown from a blob URL.
 * One fetch per still for the whole page: two figures show the same page.
 */
type Stills = Partial<Record<"menu" | "tool-list" | "tool-front" | "tool-back", string>>;

function Still({ src, alt, markers = [] }: { src?: string; alt: string; markers?: Marker[] }) {
  return (
    <figure className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100 shadow-md ring-1 ring-black/10">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a private image
        <img src={src} alt={alt} width={960} height={720} className="block h-auto w-full" />
      ) : (
        <span role="img" aria-label={alt} className="absolute inset-0 animate-pulse bg-gray-100" />
      )}
      {/* Hidden from screen readers: a name on a plain span is not allowed
          (ARIA's generic role), and where it was read the digit was not, so
          the marker could not be matched to its line in the Key. The Key
          under each figure says everything the markers do; `label` stays in
          the data as a note for whoever edits this page.
          One size at every width, the Key's own: the sm: step made them
          bigger exactly where two columns make the stills smallest (256px
          at 640).
          The brand gradient, not flat magenta: the guide's own menu prints
          pink numbered circles (1-6 over the six tools), and in the same
          pink these markers read as part of the page. */}
      {src && markers.map((m) => (
        <span
          key={m.n}
          aria-hidden="true"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
          className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-runfree-grad text-xs font-bold text-white shadow-lg ring-2 ring-white"
        >
          {m.n}
        </span>
      ))}
    </figure>
  );
}

function Key({ items }: { items: { n: number; text: React.ReactNode }[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((i) => (
        <li key={i.n} className="flex gap-3 text-[15px] leading-relaxed text-gray-700">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-runfree-grad text-xs font-bold text-white">
            {i.n}
          </span>
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-runfree-magentaDeep">{eyebrow}</p>
      <h2 className="mt-1 font-display text-xl font-bold text-runfree-ink sm:text-2xl" style={{ textWrap: "balance" }}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function GuideHowToPage() {
  const router = useRouter();
  const [framer, setFramer] = useState<Framer | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "error">("checking");
  const [stills, setStills] = useState<Stills>({});

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const names = ["menu", "tool-list", "tool-front", "tool-back"] as const;
      await Promise.all(
        names.map(async (name) => {
          try {
            const res = await fetch(`/api/guide-howto/${name}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) return;
            const url = URL.createObjectURL(await res.blob());
            urls.push(url);
            if (cancelled) return;
            setStills((prev) => ({ ...prev, [name]: url }));
          } catch {
            // The figure keeps its grey placeholder; the Key still explains it.
          }
        })
      );
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [status]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.replace(loginUrlHere());
        return;
      }
      const [current, allowed] = await Promise.all([
        getCurrentFramer() as Promise<Framer | null>,
        hasCertificationAccess(),
      ]);
      if (!allowed) {
        setStatus("denied");
        return;
      }
      setFramer(current);
      setStatus("ready");
    })().catch(() => setStatus("error"));
  }, [router]);

  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  if (status === "error") return <AccessError onRetry={() => window.location.reload()} />;
  if (status !== "ready") return <PageLoader label="Checking your access…" />;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        section="certification"
        backHref="/guide"
        backLabel="Digital Facilitator's Guide"
        framer={framer}
        onSignOut={async () => {
          await logout();
          router.replace("/auth/login");
        }}
        title="How to Use the Guide"
        subtitle="The menu, the two sides of a tool, and the logo that takes you back"
        badge
      />

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <p className="text-[15px] leading-relaxed text-gray-700">
          The Digital Facilitator&rsquo;s Guide is built like a deck of cards you can
          click through. Three ideas are all you need: a <strong>menu</strong> that
          gets you to any tool in two taps, a <strong>front and back</strong> for almost
          every tool, and a <strong>logo</strong> in the top-right corner that always takes
          you one step back up.
        </p>

        <Section eyebrow="1 · The menu" title="Start at the menu: six tools, two taps to anywhere">
          <p className="text-[15px] leading-relaxed text-gray-700">
            Page 2 is the menu. Each of the six tools opens its own <em>Tool List</em>{" "}
            &mdash; every exercise in that module, numbered in the order you teach it.
            Tap any line on the list to go straight to it. The <em>Deliverables</em>{" "}
            line takes you to what that module produces.
          </p>
          {/* 1 sits under Funnel Fusion, not on the menu's own pink "1" above
              it, which it used to cover. 2 and 3 sit in the empty gutter left
              of the line numbers: on the lines they hid the words you tap. 3 is
              a touch above level with Deliverables so that on a 320px phone it
              clears the copyright line under it. */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Still
              src={stills["menu"]}
              alt="The guide's menu page: six tool icons, numbered 1 to 6"
              markers={[{ n: 1, x: 11.5, y: 80, label: "Tap a tool" }]}
            />
            <Still
              src={stills["tool-list"]}
              alt="The Funnel Fusion Tool List: tools 1.0 to 1.13 and Deliverables"
              markers={[
                { n: 2, x: 12, y: 50.6, label: "Tap a line" },
                { n: 3, x: 12, y: 85.5, label: "Deliverables" },
              ]}
            />
          </div>
          <Key
            items={[
              { n: 1, text: <>On the menu, tap a tool to open its Tool List.</> },
              { n: 2, text: <>On a Tool List, tap any line to jump to that tool.</> },
              { n: 3, text: <><em>Deliverables</em> jumps to the module&rsquo;s finished work.</> },
            ]}
          />
        </Section>

        <Section eyebrow="2 · Front and back" title="A tool is one card with two sides">
          {/* Not "every tool": 71 of the 78 numbered tools are a front then a back.
              Each Pre-work (1.0, 2.0 ...) is one page with a light header, and 4.5
              runs two fronts (p110, p111 "CONT.") before its back (p112). */}
          <p className="text-[15px] leading-relaxed text-gray-700">
            Almost every tool takes two pages that belong together, like the front and
            back of a card. They share the same tool number, title and time. You can
            tell them apart by the header: the <strong>front</strong> has a dark blue
            header, the <strong>back</strong> a light one. Two exceptions: each
            module&rsquo;s Pre-work (1.0, 2.0 and so on) is a single page, and 4.5 has
            two fronts before its back.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              {/* The guide never says the front is shown to the team, and many
                  fronts are a finished example (p11's filled-in Expectations,
                  p31's "Flip Chart Finish"; p103 has the team cover the handout).
                  So: what goes up in the room, not what the room sees. */}
              <p className="mb-2 text-sm font-semibold text-runfree-ink">Front &mdash; what goes up in the room</p>
              <Still
                src={stills["tool-front"]}
                alt="Front of tool 3.9: dark header and the flip chart for the room"
                markers={[
                  { n: 4, x: 7.5, y: 22, label: "Tool number" },
                  { n: 5, x: 83.3, y: 22, label: "Timer" },
                  { n: 6, x: 50, y: 55, label: "The visual" },
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-runfree-ink">Back &mdash; how you lead it</p>
              <Still
                src={stills["tool-back"]}
                alt="Back of tool 3.9: Big Idea, How It Works, Coaching Tips, and the handout and video icons"
                markers={[
                  { n: 7, x: 50, y: 55, label: "Big Idea, How It Works, Coaching Tips" },
                  { n: 8, x: 77, y: 21, label: "Handout and video icons" },
                ]}
              />
            </div>
          </div>
          <Key
            items={[
              { n: 4, text: <>The tool number (3.9 here) is the same one as on the Tool List. When a tool has a walkthrough video on Facilitator Training, its name starts with that number too.</> },
              { n: 5, text: <>The clock is roughly how long the tool takes in the room.</> },
              { n: 6, text: <>The <strong>front</strong> shows what goes up in the room: the flip chart you&rsquo;ll draw (often filled in as an example), the handout or the visual.</> },
              { n: 7, text: <>The <strong>back</strong> is for you: the <em>Big Idea</em>, <em>How It Works</em> step by step, and <em>Coaching Tips</em> from experience.</> },
              { n: 8, text: <>The handout and video icons open that tool&rsquo;s sheet and walkthrough right here in the portal. A grey icon means there isn&rsquo;t one for this tool.</> },
            ]}
          />
        </Section>

        <Section eyebrow="3 · The logo" title="The logo in the top-right corner takes you back up">
          <p className="text-[15px] leading-relaxed text-gray-700">
            Wherever you are, tap the logo in the top-right corner to go one level up.
            From a tool it goes to that module&rsquo;s Tool List. From a Tool List it goes
            to the menu. From the menu it goes to the cover.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Still
              src={stills["tool-front"]}
              alt="A tool page with its top-right logo highlighted"
              markers={[{ n: 9, x: 92.4, y: 22, label: "Logo: back to the Tool List" }]}
            />
            <Still
              src={stills["tool-list"]}
              alt="A Tool List with its top-right logo highlighted"
              markers={[{ n: 10, x: 92.4, y: 22, label: "Logo: back to the menu" }]}
            />
          </div>
          <Key
            items={[
              { n: 9, text: <>On a tool page, the logo goes back to that module&rsquo;s Tool List.</> },
              { n: 10, text: <>On a Tool List, the logo goes back to the menu.</> },
            ]}
          />
          <p className="mt-4 text-[15px] leading-relaxed text-gray-700">
            So the whole guide is a loop: <strong>menu &rarr; Tool List &rarr; tool</strong>, and
            the logo to climb back. You never need to scroll through 172 pages.
          </p>
        </Section>

        <Section eyebrow="4 · In the portal" title="Reading it here">
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-gray-700">
            <li>All of these links work in the portal&rsquo;s viewer, on a computer, a phone or an iPad.</li>
            <li>
              The page number and a <em>go to page</em> box sit at the top of the viewer, for
              when someone says &ldquo;turn to page 88&rdquo;.
            </li>
            <li>
              The guide is always the current edition: when a new one is published, the Guide
              page opens it automatically.
            </li>
          </ul>
          <a
            href="/guide"
            className="mt-6 inline-flex rounded-lg bg-runfree-grad px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Open the Guide
          </a>
        </Section>
      </main>

      <PortalFooter />
    </div>
  );
}
