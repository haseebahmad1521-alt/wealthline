import { useEffect, useState } from 'react';

import { celShade } from '@/lib/cel';
import { portraitAt } from '@/lib/portrait';

/**
 * Web: each AI avatar is cel-shaded and washed once, in idle time, and kept as an image (memory for this visit, Cache
 * Storage across visits), so no filter runs while the app draws (owner, Nov 2). 192 px covers a 96-pt avatar at 2×.
 */
const PX = 192;
const CACHE = 'wl-cel-v1';
const made = new Map<string, Promise<string | null>>();

const idle = () =>
  new Promise<void>((done) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(() => done(), { timeout: 2000 }) : setTimeout(done, 200),
  );

async function bake(uri: string): Promise<string | null> {
  const key = `https://cel.wealthline.invalid/${encodeURIComponent(uri)}`;
  const store = 'caches' in window ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await store?.match(key).catch(() => undefined);
  if (hit) return URL.createObjectURL(await hit.blob());

  const img = new Image();
  img.crossOrigin = 'anonymous'; // Commons and Supabase Storage send CORS headers; without them the canvas is unreadable
  img.src = portraitAt(uri, PX);
  await img.decode();
  await idle();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // Cover, aligned to the top (as the live portraits are), so faces stay in frame.
  const s = Math.max(PX / img.naturalWidth, PX / img.naturalHeight);
  ctx.drawImage(img, (PX - img.naturalWidth * s) / 2, 0, img.naturalWidth * s, img.naturalHeight * s);
  const px = ctx.getImageData(0, 0, PX, PX);
  celShade(px.data, PX, PX);
  ctx.putImageData(px, 0, 0);
  // The orange→purple wash, baked in: colour at 50%, soft light at 30% (keeps the photo's luminance, so ink stays dark).
  const wash = ctx.createLinearGradient(0, 0, PX, PX);
  wash.addColorStop(0, '#FF9A4D');
  wash.addColorStop(0.55, '#C2569E');
  wash.addColorStop(1, '#7B5CFF');
  ctx.fillStyle = wash;
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, PX, PX);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 0, PX, PX);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.85));
  if (!blob) return null;
  store?.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => {});
  return URL.createObjectURL(blob);
}

/** The baked avatar's URL once ready; null while baking or if the photo can't be read (then show it unfiltered). */
export function useCelAvatar(uri: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!uri) return;
    let live = true;
    let p = made.get(uri);
    if (!p) {
      p = bake(uri).catch(() => null);
      made.set(uri, p);
    }
    p.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [uri]);
  return url;
}
