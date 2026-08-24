import type { Metadata } from "next";
import Image from "next/image";
import PortalFooter from "@/components/PortalFooter";

export const metadata: Metadata = {
  title: "Privacy Policy · RunFree Portal",
  description: "What the RunFree portal collects, where it is stored, and who it is shared with.",
  // Readable by crawlers: Google must fetch these during OAuth brand
  // verification, and the root layout otherwise marks everything noindex.
  robots: { index: true, follow: true },
};

/**
 * Privacy policy.
 *
 * Public and unauthenticated on purpose: Google requires a reachable privacy
 * policy URL before it will verify an OAuth app's branding, and a reviewer is
 * not signed in. It is also the honest place for it — someone deciding
 * whether to accept an invitation should be able to read this first.
 *
 * Everything below describes what the system ACTUALLY does, checked against
 * the code rather than written from a template: Supabase for accounts and
 * storage, Google Drive for the handout library, GoHighLevel for the
 * certification roster, Loom for session recordings, Vercel for hosting.
 * If any of those change, this page changes with them.
 */
const UPDATED = "19 August 2026";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-runfree-navy">
        <div className="h-1.5 bg-runfree-grad" />
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <a href="/" className="inline-flex items-center">
            <Image
              src="/brand/runfree-logo-white.png"
              alt="RunFree"
              width={200}
              height={88}
              className="h-8 w-auto"
            />
          </a>
          <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-white/70">Last updated {UPDATED}</p>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-9">
          <Section title="Who this covers">
            <P>
              The RunFree portal at <B>portal.runfree.co</B> is operated by RunFree. It is a
              private workspace for churches and leaders in a coaching or vision-framing
              engagement with us, and for Certified Vision Framers using our training material.
              There is no public area — everything requires an invitation and a sign-in.
            </P>
          </Section>

          <Section title="What we collect">
            <P>Only what the portal needs to work:</P>
            <List
              items={[
                <>
                  <B>Your name and email address.</B> Supplied when RunFree invites you, or taken
                  from your Google account if you sign in with Google.
                </>,
                <>
                  <B>Your role at your organisation</B>, where you or your team tell us — for
                  example &ldquo;Lead Pastor&rdquo;. This is a label; it grants nothing.
                </>,
                <>
                  <B>What you do in your project.</B> Notes, tasks, uploaded documents and
                  photographs of work from your sessions, and which parts you have marked
                  complete.
                </>,
                <>
                  <B>A profile photograph</B>, only if one is uploaded for you.
                </>,
              ]}
            />
            <P>
              We do not use tracking cookies, we do not run advertising, and we do not build
              behavioural profiles. We do not sell personal information to anyone, ever.
            </P>
          </Section>

          <Section title="If you sign in with Google">
            <P>
              Signing in with Google shares your <B>name, email address and profile picture</B>{" "}
              with us. That is all we ask for and all we receive. We cannot read your Gmail, your
              Google Drive, your Calendar or your contacts, and we never request access to them.
            </P>
            <P>
              You can use an email address and password instead if you prefer; nothing in the
              portal requires a Google account.
            </P>
          </Section>

          <Section title="Where it is kept, and who else is involved">
            <P>
              We use a small number of established providers to run the portal. Each one only
              receives what it needs for its job:
            </P>
            <List
              items={[
                <>
                  <B>Supabase</B> — accounts, sign-in, and the database and file storage holding
                  your project. This is where your information primarily lives.
                </>,
                <>
                  <B>Vercel</B> — hosting. It serves the pages and keeps ordinary server logs.
                </>,
                <>
                  <B>Google Drive</B> — the standard handout library. These are RunFree&rsquo;s
                  own documents; nothing you upload is sent to Drive.
                </>,
                <>
                  <B>Loom</B> — session recordings, where your coach records one. Recordings are
                  unlisted and reachable only through your project.
                </>,
                <>
                  <B>GoHighLevel</B> — our customer records. Used for Certified Vision Framers and
                  for the people RunFree works with directly, to keep track of who holds a
                  certification. Church team members are not added there unless RunFree adds them
                  deliberately.
                </>,
              ]}
            />
          </Section>

          <Section title="Who can see your project">
            <P>
              Only people invited to it, plus the RunFree team leading your engagement. Access is
              per project: someone on one church&rsquo;s engagement cannot see another&rsquo;s.
              This is enforced by the database itself rather than by the pages you see, so it
              holds even if something in the interface goes wrong.
            </P>
            <P>
              Some material is drafted before it is shared. Session notes and finished work stay
              hidden from your team until your coach publishes them.
            </P>
          </Section>

          <Section title="How long we keep it">
            <P>
              For as long as your engagement is active, and afterwards while the record remains
              useful to you — teams routinely come back to their vision work years later. Ask us
              to delete your project or your account and we will, permanently, including uploaded
              files.
            </P>
          </Section>

          <Section title="Your choices">
            <List
              items={[
                <>Ask for a copy of what we hold about you.</>,
                <>Correct anything that is wrong — or edit it yourself in the portal.</>,
                <>Ask us to delete your account and your project content.</>,
                <>Withdraw from the portal entirely; that does not affect your engagement.</>,
              ]}
            />
            <P>
              Email <Mail /> and we will act on it. We do not require a particular form of words.
            </P>
          </Section>

          <Section title="Security">
            <P>
              Everything travels over an encrypted connection. Uploaded documents and photographs
              are held in private storage and are only reachable through short-lived links issued
              to someone already signed in and already on that project — a copied link does not
              work for anyone else, and stops working shortly afterwards.
            </P>
            <P>
              No system is perfect. If we ever discovered a breach affecting your information, we
              would tell you directly rather than wait to be asked.
            </P>
          </Section>

          <Section title="Children">
            <P>
              The portal is for church leaders and staff. It is not intended for anyone under 16,
              and we do not knowingly collect their information.
            </P>
          </Section>

          <Section title="Changes">
            <P>
              If this policy changes we will update the date at the top. Where a change materially
              affects what we do with your information, we will tell the people it affects rather
              than rely on you re-reading the page.
            </P>
          </Section>

          <Section title="Contact">
            <P>
              RunFree — <Mail />. We would rather you asked than wondered.
            </P>
          </Section>
        </div>
      </main>

      <PortalFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold tracking-tight text-runfree-ink">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-gray-600">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-runfree-ink">{children}</strong>;
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-gray-600">
          <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-runfree-magenta" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Mail() {
  return (
    <a
      href="mailto:andrew@runfree.co"
      className="font-medium text-runfree-magentaDeep hover:underline"
    >
      andrew@runfree.co
    </a>
  );
}
