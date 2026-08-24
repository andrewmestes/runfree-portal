import type { Metadata } from "next";
import Image from "next/image";
import PortalFooter from "@/components/PortalFooter";

export const metadata: Metadata = {
  title: "Terms of Service · RunFree Portal",
  description: "The terms for using the RunFree portal.",
  // Readable by crawlers: Google must fetch these during OAuth brand
  // verification, and the root layout otherwise marks everything noindex.
  robots: { index: true, follow: true },
};

/**
 * Terms of service.
 *
 * Public and unauthenticated for the same reason as the privacy policy:
 * Google requires a reachable terms URL to verify an OAuth app, and the
 * reviewer is not signed in.
 *
 * Written to describe this portal specifically rather than as boilerplate —
 * the sections that matter here are who owns the vision work (the church) and
 * who owns the process material (RunFree), because that distinction is the
 * whole commercial shape of the product.
 */
const UPDATED = "19 August 2026";

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-white/70">Last updated {UPDATED}</p>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 sm:p-9">
          <Section title="What this is">
            <P>
              The RunFree portal at <B>portal.runfree.co</B> is a private workspace provided by
              RunFree to churches and leaders in a coaching or vision-framing engagement, and to
              Certified Vision Framers using our training material. Using it means accepting these
              terms.
            </P>
          </Section>

          <Section title="Your account">
            <P>
              Accounts are created by invitation. Keep your sign-in details to yourself — anything
              done from your account is treated as done by you. Do not share a login; if someone
              else needs access, ask us and we will add them properly.
            </P>
            <P>
              Tell us promptly if you think someone has got into your account, and we will help you
              secure it.
            </P>
          </Section>

          <Section title="Who owns what">
            <P>
              <B>Your work is yours.</B> The mission, values, strategy, measures and vision your
              team produces belong to your church. Nothing here transfers ownership of it to us,
              and you may take it with you.
            </P>
            <P>
              <B>The process is ours.</B> The Pivvot Vision Framing material — handouts, teaching
              videos, the Digital Facilitator&rsquo;s Guide, frameworks and templates — remains the
              property of RunFree and its authors. You may use it within your own church or, if you
              are certified, in engagements you facilitate. Please do not republish it, resell it,
              or pass it on to people outside your engagement.
            </P>
          </Section>

          <Section title="Fair use">
            <P>Please do not:</P>
            <List
              items={[
                <>upload anything unlawful, or anything you do not have the right to share;</>,
                <>try to reach another church&rsquo;s project, or anyone&rsquo;s account but your own;</>,
                <>probe, scrape or attempt to disrupt the service;</>,
                <>use the portal to store material unrelated to your engagement.</>,
              ]}
            />
            <P>
              We may suspend access that puts other people&rsquo;s information or the service at
              risk. Where we can, we will talk to you first.
            </P>
          </Section>

          <Section title="Availability">
            <P>
              We work to keep the portal running and your material safe, but we cannot promise it
              will never be unavailable. Maintenance happens, and providers occasionally have
              outages. Nothing here is a guarantee of uninterrupted service.
            </P>
            <P>
              Keep your own copies of anything you cannot afford to lose. Finished work can be
              downloaded from your project at any time.
            </P>
          </Section>

          <Section title="Ending access">
            <P>
              You may ask us to close your account at any time. We may end access when an
              engagement ends, though we usually leave a project in place afterwards because teams
              come back to it. Ask and we will delete your account and content permanently.
            </P>
          </Section>

          <Section title="Liability">
            <P>
              The portal is provided as it is. To the extent the law allows, RunFree is not liable
              for indirect or consequential loss arising from its use. Nothing in these terms
              limits liability that cannot lawfully be limited.
            </P>
          </Section>

          <Section title="Changes">
            <P>
              We may update these terms. The date above shows when they last changed, and we will
              tell you directly about anything that materially affects you rather than rely on you
              re-reading the page.
            </P>
          </Section>

          <Section title="Contact">
            <P>
              RunFree —{" "}
              <a
                href="mailto:andrew@runfree.co"
                className="font-medium text-runfree-magentaDeep hover:underline"
              >
                andrew@runfree.co
              </a>
              . See also our{" "}
              <a href="/privacy" className="font-medium text-runfree-magentaDeep hover:underline">
                Privacy Policy
              </a>
              .
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
