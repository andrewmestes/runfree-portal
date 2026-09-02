"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalHeader from "@/components/PortalHeader";
import PortalFooter from "@/components/PortalFooter";
import { supabase } from "@/lib/supabase";
import { getCurrentProfile, listMyProjects } from "@/lib/auth";

/** Same shape the other pages declare locally; auth.ts exports no type. */
type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  is_staff: boolean;
  is_owner: boolean;
  certification_access: boolean;
};

/**
 * The certification hub — the door into everything a Certified Vision Framer
 * has, restored as a page rather than a dropdown.
 *
 * This is the Certified Vision Framer Hub from the old standalone portal,
 * brought across during the merge. It was dropped at the time because its
 * four links fitted in a menu, which missed the point Andrew is making: the
 * menu made certification look like four more items in the project portal's
 * navigation, when it is a different place with a different purpose.
 *
 * "I would like when somebody clicks on certification that it isn't actually
 * a submenu, but it actually opens to the original home page that we had
 * designed in the certification portal where it had cards for every
 * individual thing... it needs to very clearly distinguish that this is a
 * different section that somebody is in."
 *
 * So the header here is branded Pivvot Vision Framing rather than RunFree
 * projects, and every certification page carries that same banner (see
 * PortalHeader's `section` prop) — you can tell which half of the portal you
 * are in from the top of the screen alone.
 */
export default function CertificationHubPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "error">("checking");
  /**
   * Whether to offer a way back to the projects list at all.
   *
   * A certified framer who holds no projects has no list to go back to — for
   * them this hub IS the portal, and "← Your projects" leads to an empty
   * page that reads as something broken. Andrew: "only people with that level
   * of permissions would need to see this. otherwise it would just be this
   * page for them."
   *
   * Keyed on actually having a project rather than on the role, because a
   * subscribed framer between engagements is in the same position as a plain
   * one, and a plain framer invited onto somebody's project genuinely does
   * have somewhere to go.
   */
  const [hasProjects, setHasProjects] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth/login");
        return;
      }
      const current = (await getCurrentProfile()) as Profile | null;
      setProfile(current);
      try {
        setHasProjects(((await listMyProjects()) ?? []).length > 0);
      } catch {
        // Not being able to count them is no reason to block the hub.
      }
      // Same gate the certification pages themselves use.
      setStatus(current?.certification_access || current?.is_staff ? "ready" : "denied");
    })().catch(() => {
      // A ProfileLookupError used to strand the hub on "Loading…" with no
      // way forward.
      setStatus("error");
    });
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  if (status === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="grid min-h-screen place-items-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <h1 className="font-display text-xl font-bold text-runfree-ink">
            Couldn&rsquo;t load your account
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Something went wrong reading your profile. It is usually momentary.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-runfree-grad px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <PortalHeader profile={profile} onSignOut={handleSignOut} title="" showTitleBlock={false} />
        <main className="flex-1 mx-auto w-full max-w-xl px-4 py-24 text-center">
          <h1 className="font-display text-2xl font-bold text-runfree-ink">
            This area is for Certified Vision Framers
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            If you think you should have access, get in touch and we&rsquo;ll sort it out.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex rounded-lg bg-runfree-grad px-4 py-2 text-sm font-semibold text-white"
          >
            Back to your projects
          </a>
        </main>
        <PortalFooter />
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <PortalHeader
        profile={profile}
        onSignOut={handleSignOut}
        certificationAccess
        section="certification"
        badge
        backHref={hasProjects ? "/" : undefined}
        backLabel="Your projects"
        eyebrow={firstName ? `Welcome back, ${firstName}` : undefined}
        title="Certified Vision Framer Hub"
        subtitle="Helping teams run free into what Jesus started"
      />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <HubCard
            href="/resources"
            icon={<HandoutsIcon />}
            title="Process Handouts"
            description="Every certification handout, module by module, straight from Drive."
          />
          <HubCard
            href="/videos"
            icon={<VideosIcon />}
            title="Training Videos"
            description="Walkthroughs and coaching for facilitating each tool."
          />
          <HubCard
            href="/books"
            icon={<BooksIcon />}
            title="Books"
            description="Visual summaries, chapters, and full downloads of the books behind the process."
          />
          <HubCard
            href="/guide"
            icon={<GuideIcon />}
            title="Digital Facilitator's Guide"
            description="The complete training playbook in one file, always current."
          />
          <HubCard
            href="/keynotes"
            icon={<KeynotesIcon />}
            title="Keynote Presentations"
            description="The decks you teach from, in Keynote and PowerPoint."
          />
        </div>
      </main>

      <PortalFooter />
    </div>
  );
}

function HubCard({
  href,
  icon,
  title,
  description,
  comingSoon = false,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  comingSoon?: boolean;
}) {
  if (comingSoon) {
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
        <div className="h-1 bg-gray-200" />
        <div className="flex flex-1 flex-col p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
            {icon}
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-gray-500">{title}</h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">{description}</p>
          <div className="mt-4">
            <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
              Coming soon
            </span>
          </div>
        </div>
      </div>
    );
  }

  /**
   * The colour sits in the icon chip and a thin accent rule rather than
   * flooding the card, which keeps the brand present while the type stays on
   * white where it reads properly.
   */
  return (
    <a
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-runfree-magenta/35"
    >
      <div className="h-1 bg-runfree-grad" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-runfree-pink/45 to-transparent opacity-70 transition duration-300 group-hover:opacity-100"
      />
      <div className="relative flex flex-1 flex-col p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-runfree-grad text-white shadow-sm">
          {icon}
        </span>
        <h2 className="mt-4 font-display text-lg font-bold text-runfree-ink">{title}</h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{description}</p>
        <div className="mt-4">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-runfree-magentaDeep">
            Open
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 transition group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H4a1 1 0 110-2h8.586l-2.293-2.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}

function HandoutsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <path
        d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function VideosIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 9.5l5 2.5-5 2.5v-5z" fill="currentColor" />
    </svg>
  );
}

function BooksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <path
        d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 014 18.5v-13z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 001.5-1.5v-13z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 1.75h6a.75.75 0 01.75.75v2.5H8.25v-2.5A.75.75 0 019 1.75z" fill="currentColor" />
      <path d="M9 11h6M9 14.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function KeynotesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5.5 11a6.5 6.5 0 0013 0M12 17.5v3M9 20.5h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
