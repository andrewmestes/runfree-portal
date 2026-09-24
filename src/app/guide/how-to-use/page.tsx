import { redirect } from "next/navigation";

/**
 * The old "How to Use the Guide" page. Andrew replaced it with the guided
 * tour on the Guide page itself (components/GuideTour, 24 Sept 2026: "let's
 * just have that live on the DFG page"), so any saved link opens that.
 */
export default function HowToUseRedirect() {
  redirect("/guide?tour=1");
}
