import type { Metadata, Viewport } from "next";
import { Poppins, Montserrat } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RunFree Portal",
  description:
    "Session recordings, coaching notes, and deliverables for RunFree engagements.",
  // Gated per-engagement content — nothing here should be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    title: "RunFree Portal",
    siteName: "RunFree",
    description:
      "Session recordings, coaching notes, and deliverables for RunFree engagements.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#E43D96",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${montserrat.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-white font-sans text-gray-700 antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
