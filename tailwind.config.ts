import type { Config } from "tailwindcss";

// RunFree brand tokens, carried over from the Certified Vision Framers portal
// unchanged — same brand, same palette.
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        runfree: {
          magenta: "#E43D96",
          magentaDeep: "#C21F73", // text/hover on light grounds
          orange: "#F15A25",
          orangeLight: "#FF7C58",
          navy: "#1F378C",
          ink: "#2B2A55",
          pink: "#FCE9F1", // soft tint
          indigo: "#E9EDF9", // soft tint
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
        display: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "runfree-grad": "linear-gradient(90deg, #E43D96, #F15A25)",
        // Deliberately one gradient, not two. The deeper pair read as muddy
        // beside the bright one — Andrew: "I like the first, brighter, image.
        // the second is a bit dark." Removed rather than left defined, so
        // nobody reaches for it again by habit.
        "runfree-sunset":
          "linear-gradient(80deg, #20378C 4%, #2F57D0 28%, #E43D96 62%, #FF7C58 98%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
