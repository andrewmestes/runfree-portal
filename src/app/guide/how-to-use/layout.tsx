import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Use the Guide · RunFree Portal",
  description: "The Digital Facilitator's Guide's menu, tool cards and logo links, explained.",
};

export default function HowToUseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
