export const R = 20; // corner radius
export const TAIL = 11; // tail height above the body

/**
 * Outline of a speech bubble whose tail rises from the top edge at `tailX`, built for the exact size like a 9-patch:
 * corners and the curved tail keep their geometry, only the straight edges stretch.
 */
export function bubblePath(w: number, h: number, tailX: number) {
  const t = Math.min(Math.max(tailX, R + 14), w - R - 16);
  const top = TAIL;
  return [
    `M${R},${top}`,
    `H${t - 13}`,
    // Tail: a soft rise to a slightly hooked tip, then a longer, gentler fall back to the edge.
    `C${t - 6},${top} ${t - 2.5},${top - 3} ${t - 1.5},0`,
    `C${t + 1.5},${top - 4} ${t + 7},${top} ${t + 16},${top}`,
    `H${w - R}`,
    `A${R},${R} 0 0 1 ${w},${top + R}`,
    `V${h - R}`,
    `A${R},${R} 0 0 1 ${w - R},${h}`,
    `H${R}`,
    `A${R},${R} 0 0 1 0,${h - R}`,
    `V${top + R}`,
    `A${R},${R} 0 0 1 ${R},${top}`,
    'Z',
  ].join('');
}
