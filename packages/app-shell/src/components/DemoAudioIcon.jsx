import React from "react";

/**
 * The demo mark, shared by every surface that offers the bundled track: the
 * web app, the desktop audio controls, and the mobile demo transport.
 *
 * The flanks are the Baryon mark's own opposed crescents — true crescents cut
 * from two offset circles, so they taper to points exactly as the logo does —
 * opened just far enough to cradle a transport glyph. The crescents carry the
 * identity, so the centre is free to state play or stop without the mark ever
 * becoming a different object.
 *
 * Geometry note: each crescent is the region between two arcs sharing the tips
 * (2.6, 2.5) and (2.6, 21.5). Sagittas 5.6 and 2.6 give radii 10.86 and 18.66
 * and a 3-unit belly — heavier than the logo's proportions, because a crescent
 * drawn to true weight disappears at the 16px the controls row renders it at.
 * The right crescent is the mirror through x = 12.
 *
 * @param {{ variant?: "play" | "stop", size?: number }} props
 */
export default function DemoAudioIcon({ variant = "play", size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-testid="demo-audio-icon"
      data-variant={variant}
    >
      <path d="M2.6 2.5A10.86 10.86 0 0 1 2.6 21.5A18.66 18.66 0 0 0 2.6 2.5Z" />
      <path d="M21.4 2.5A10.86 10.86 0 0 0 21.4 21.5A18.66 18.66 0 0 1 21.4 2.5Z" />
      {variant === "stop" ? (
        <rect
          x="10.15"
          y="10.15"
          width="3.7"
          height="3.7"
          rx="0.85"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      ) : (
        // Filled and stroked so the corners round without hand-built arcs.
        <path
          d="M10.2 9.4 14.1 12 10.2 14.6Z"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
