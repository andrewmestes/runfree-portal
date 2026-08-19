import { ImageResponse } from "next/og";

/**
 * The preview card people see when the portal link is shared.
 *
 * Andrew texted portal.runfree.co to someone and got a bare grey row with
 * Safari's compass glyph — because the app had og:title and og:description
 * but no og:image at all, and iMessage, WhatsApp, Slack and the rest all need
 * the image before they will render a card rather than a link.
 *
 * Generated rather than a static PNG so it stays in step with the brand
 * without anyone remembering to re-export it, and so the wording lives beside
 * the rest of the app's copy.
 *
 * Deliberately no photograph and no screenshot: this link is usually sent to
 * one church leader who is about to sign in, so the job is to look
 * unmistakably like RunFree and say what it is — not to sell anything.
 */
export const runtime = "edge";
export const alt = "RunFree Portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#1F378C",
          position: "relative",
        }}
      >
        {/* The brand bar, top edge — the same rule that heads every card. */}
        <div
          style={{
            height: 16,
            width: "100%",
            background: "linear-gradient(90deg, #E43D96, #F15A25)",
          }}
        />

        {/* A soft magenta bloom, echoing the hero on the project page. */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -160,
            width: 620,
            height: 620,
            borderRadius: 620,
            background: "rgba(228, 61, 150, 0.30)",
            filter: "blur(90px)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "0 84px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 6,
              fontWeight: 700,
              color: "#FCE9F1",
              textTransform: "uppercase",
            }}
          >
            RunFree
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: -3,
              marginTop: 14,
              lineHeight: 1,
            }}
          >
            RunFree Portal
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 34,
              color: "rgba(255,255,255,0.72)",
              marginTop: 28,
              maxWidth: 880,
              lineHeight: 1.35,
            }}
          >
            Your vision framing engagement — sessions, handouts, and the work your team builds.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 52,
            }}
          >
            <div
              style={{
                display: "flex",
                background: "linear-gradient(90deg, #E43D96, #F15A25)",
                color: "#FFFFFF",
                fontSize: 26,
                fontWeight: 700,
                padding: "14px 30px",
                borderRadius: 999,
              }}
            >
              portal.runfree.co
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
