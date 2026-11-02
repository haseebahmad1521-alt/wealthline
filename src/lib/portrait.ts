// Portraits are Wikimedia Commons originals (often 1–3 MB, thousands of pixels). Decoding a dozen of those at once
// stalls the page (World opening showed it), so every view asks Commons for a thumbnail sized to the display instead.
// Commons serves a fixed set of thumbnail widths; the step above the needed width is used. Other hosts pass through.

// One small size covers every list, podium and globe bubble, so a portrait downloads and decodes once for all of them.
const STEPS = [250, 500, 960];
// An original (…/commons/a/ab/File.jpg) or an existing thumbnail (…/commons/thumb/a/ab/File.jpg/960px-File.jpg), on
// either Commons media host.
const COMMONS = /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)/;

/** A thumbnail of `url` at least `px` device pixels wide, or `url` unchanged when it isn't a Commons image. */
export function portraitAt(url: string, px: number): string {
  const m = COMMONS.exec(url);
  if (!m) return url;
  const [, host, a, ab, file] = m;
  // Commons renders SVG/TIFF/PDF thumbs as PNG/JPEG with a changed name; keep those (rare for portraits) as they are.
  if (!/\.(jpe?g|png|webp)$/i.test(file)) return url;
  const w = STEPS.find((s) => s >= px) ?? STEPS[STEPS.length - 1];
  return `https://${host}.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${w}px-${file}`;
}

/** Device pixels for a portrait drawn `size` points wide (capped at 3× density). */
export const portraitPx = (size: number, dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 3) =>
  Math.ceil(size * Math.min(3, dpr));
