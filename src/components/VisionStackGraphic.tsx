"use client";

import { useEffect, useState } from "react";

/**
 * The exploded Vision Stack, built in CSS 3D rather than dropped in as a
 * picture.
 *
 * Andrew has this as a Canva graphic and asked whether we could use the file
 * and animate it. An exported PNG can only ever be faded or slid around as
 * one flat rectangle — the interesting motion is the plates moving
 * *independently*, which needs them to be four separate elements. So this
 * rebuilds the same composition as four isometric planes: same stacking
 * order, same navy-to-periwinkle range, same exploded gaps.
 *
 * What that buys, beyond the animation: each plate is a real button. Hovering
 * one lifts it out of the stack and clicking it jumps to that layer's
 * section, so the graphic navigates the page instead of decorating it. It
 * also scales to any size without going soft, works in both themes, and
 * weighs nothing.
 *
 * The isometric projection is `rotateX(55deg) rotateZ(-45deg)`, which is what
 * turns a square div into the diamond the printed graphic uses. Each plate is
 * then pushed along Z to separate them, and the wrapper's `perspective` is
 * what stops that reading as four flat diamonds sitting on top of each other.
 */

type Plate = {
  slug: string;
  name: string;
  /** Face colour, top to bottom — deepest navy on top, lightest at the base. */
  face: string;
  edge: string;
  /** Which mark to draw on the plate. */
  motif: "gear" | "bars" | "frame" | "core";
};

/**
 * Top of the stack first, which is the order the eye reads them in — and the
 * reverse of `vision_stack_layers.position`, where the foundation is first.
 */
const PLATES: Plate[] = [
  { slug: "application-toolbox", name: "Application Toolbox", face: "#1F378C", edge: "#16276A", motif: "gear" },
  { slug: "horizon-storyline", name: "The Horizon Storyline", face: "#3A55B0", edge: "#293D85", motif: "bars" },
  { slug: "vision-frame", name: "The Vision Frame", face: "#7C90D0", edge: "#5B6CAE", motif: "frame" },
  { slug: "paradigm-convictions", name: "Paradigm Convictions", face: "#FFFFFF", edge: "#B9C4E6", motif: "core" },
];

function Motif({ kind, dark }: { kind: Plate["motif"]; dark: boolean }) {
  const stroke = dark ? "#FFFFFF" : "#1F378C";
  const fill = dark ? "#FFFFFF" : "#1F378C";

  if (kind === "gear") {
    return (
      <g>
        <circle cx="50" cy="50" r="12" fill="none" stroke={stroke} strokeWidth="7" />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x="47"
            y="26"
            width="6"
            height="9"
            fill={fill}
            transform={`rotate(${i * 45} 50 50)`}
          />
        ))}
        <path
          d="M22 44a29 29 0 0 1 44-16"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M78 56a29 29 0 0 1-44 16"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "bars") {
    return (
      <g fill={fill}>
        <rect x="14" y="30" width="30" height="12" rx="1" />
        <rect x="52" y="30" width="34" height="12" rx="1" opacity="0.55" />
        <rect x="14" y="46" width="20" height="12" rx="1" opacity="0.55" />
        <rect x="42" y="46" width="44" height="12" rx="1" />
        <rect x="14" y="62" width="38" height="12" rx="1" />
        <rect x="60" y="62" width="26" height="12" rx="1" opacity="0.55" />
      </g>
    );
  }
  if (kind === "frame") {
    return (
      <rect
        x="24"
        y="24"
        width="52"
        height="52"
        fill="none"
        stroke={stroke}
        strokeWidth="12"
      />
    );
  }
  // The foundation: a single solid mark, the shape everything else sits on.
  return (
    <path
      d="M50 24 66 44H56v22h-12V44H34z"
      fill={fill}
      transform="rotate(180 50 50)"
    />
  );
}

export default function VisionStackGraphic({
  onSelect,
  className = "",
}: {
  /** Called with the layer slug when a plate is clicked. */
  onSelect?: (slug: string) => void;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  // Assemble once, on mount. Held a frame so the transition has a "from"
  // state to run out of — setting the final transform in the same paint
  // would land it there with no motion at all.
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={`relative mx-auto ${className}`}
      style={{ perspective: "1400px", perspectiveOrigin: "50% 40%" }}
    >
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[340px]">
        {PLATES.map((p, i) => {
          const lift = hovered === p.slug;
          // Plates are 76px apart vertically; hovering pulls one 26px clear.
          const y = i * 76 - (lift ? 26 : 0);
          const dark = p.face !== "#FFFFFF";

          return (
            <button
              key={p.slug}
              type="button"
              onMouseEnter={() => setHovered(p.slug)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(p.slug)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect?.(p.slug)}
              aria-label={p.name}
              className="group absolute left-1/2 top-0 h-[190px] w-[190px] cursor-pointer border-0 bg-transparent p-0 outline-none"
              style={{
                transformStyle: "preserve-3d",
                transform: `translate(-50%, ${y}px) rotateX(55deg) rotateZ(-45deg) translateZ(${
                  shown ? 0 : -260
                }px)`,
                opacity: shown ? 1 : 0,
                transition:
                  "transform 700ms cubic-bezier(.22,1,.36,1), opacity 600ms ease-out",
                transitionDelay: shown ? `${(PLATES.length - 1 - i) * 110}ms` : "0ms",
                zIndex: PLATES.length - i,
              }}
            >
              {/* The slab's side, drawn as a second face pushed down in Z so
                  the plate reads as having thickness rather than as a decal. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-[3px]"
                style={{
                  background: p.edge,
                  transform: "translateZ(-10px)",
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-[3px] shadow-lg ring-1 ring-black/5"
                style={{ background: p.face }}
              >
                <svg viewBox="0 0 100 100" className="h-full w-full p-[14%]">
                  <Motif kind={p.motif} dark={dark} />
                </svg>
              </span>

              {/* A wash that brightens the hovered plate without shifting its
                  hue — the palette is doing the work, not the highlight. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-[3px] bg-white transition-opacity duration-300"
                style={{ opacity: lift ? 0.16 : 0 }}
              />
            </button>
          );
        })}
      </div>

      {/* The name of whatever is under the cursor. Reserved height, so the
          composition doesn't jump as it appears and disappears. */}
      <p className="mt-4 flex h-6 items-center justify-center text-sm font-bold tracking-tight text-white">
        <span
          className="transition-opacity duration-200"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          {PLATES.find((p) => p.slug === hovered)?.name ?? " "}
        </span>
      </p>
    </div>
  );
}
