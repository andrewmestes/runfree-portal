import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Here · RunFree Portal",
  description: "A new Certified Vision Framer's first week, in five steps.",
};

export default function StartHereLayout({ children }: { children: React.ReactNode }) {
  return children;
}
