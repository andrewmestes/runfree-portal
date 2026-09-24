"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentFramer, getCurrentUser, hasCertificationAccess, loginUrlHere, logout } from "@/lib/auth";
import PortalHeader from "@/components/PortalHeader";
import PageLoader from "@/components/PageLoader";
import AccessError from "@/components/AccessError";
import PortalFooter from "@/components/PortalFooter";
import StartHereChecklist from "@/components/StartHere";

type Framer = { id: string; email: string; name: string; is_admin: boolean };

/** Start here: a new framer's first week, one page of five steps (see components/StartHere). */
export default function StartHerePage() {
  const router = useRouter();
  const [framer, setFramer] = useState<Framer | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "denied" | "error">("checking");

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
        backHref="/certification"
        backLabel="Certification hub"
        framer={framer}
        onSignOut={async () => {
          await logout();
          router.replace("/auth/login");
        }}
        title="Start Here"
        subtitle="Your first week as a Certified Vision Framer"
        badge
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <StartHereChecklist />
      </main>
      <PortalFooter />
    </div>
  );
}
