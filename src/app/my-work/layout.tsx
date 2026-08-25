import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Work · RunFree Portal",
  description: "Everything RunFree owes, across every engagement.",
};

export default function MyWorkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
