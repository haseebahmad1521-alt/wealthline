// World on the real planet (owner, Nov 1, 2026): the planet scene turns to look straight at the globe, and this layer
// sits over World's globe area. Portraits sit at each person's main headquarters; when they crowd together on screen
// they slide into one joined bubble (an SVG "goo" filter fuses their glass circles, springs give the elastic overshoot)
// and split apart again as you zoom in. Tapping a "+N" bubble leans in a little and fans its people out around it, even
// when they share a city; tapping a portrait opens that person's profile. Company places are small dots: every one is
// a real site. Money flows (Money, What if) are lines along great circles with dashes travelling toward headquarters;
// shaded countries (Economies, What if) are painted on the planet itself. Choosing a person fades everyone else to 5%. Pinch, ctrl+wheel (trackpad pinch) and Safari gestures zoom the globe, never the page.
import { geoInterpolate } from 'd3-geo';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glass } from '@/components/glass';
import type { GlobeArc, GlobeFill, GlobeMarker, GlobeSite } from '@/components/globe';
import { clampZoom, scene, zoomFactor } from '@/lib/scene';
import { color, font, radius, space } from '@/theme';

const GOO_ID = 'wl-goo';
const FADED = 0.05;

if (typeof document !== 'undefined' && !document.getElementById(GOO_ID)) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  // Blur the circles together, then snap alpha back to a hard edge: nearby circles fuse into one smooth blob.
  svg.innerHTML = `<filter id="${GOO_ID}" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
    <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/>
    <feComposite in="SourceGraphic" in2="g" operator="atop"/>
  </filter>`;
  document.body.appendChild(svg);
}

type Spring = { x: number; y: number; vx: number; vy: number; op: number; scale: number; init: boolean };

// The bubble fanned open, kept outside the component so it is still open when Back returns from a profile.
let opened: { keys: Set<string>; zoom: number } | null = null;

/**
 * An opened bubble's layout (owner, Nov 2, 2026): portraits grow to fill more of the screen, the wealthiest biggest
 * (diameter by the square root of net worth, so area follows wealth). The richest sits in the middle and the rest are
 * packed around it, each placed at the first free spot along a spiral. Offsets from the crowd's centre, plus its reach.
 */
function packFan(sizes: number[], gap: number) {
  const at: { x: number; y: number }[] = [];
  let reach = 0;
  sizes.forEach((d, i) => {
    let x = 0;
    let y = 0;
    if (i > 0) {
      for (let t = 0; ; t += 0.12) {
        const r = (sizes[0] / 2 + d / 2 + gap) * (0.9 + t / (2 * Math.PI) * 0.35);
        x = r * Math.cos(t - Math.PI / 2);
        y = r * Math.sin(t - Math.PI / 2);
        if (at.every((q, j) => Math.hypot(q.x - x, q.y - y) >= (sizes[j] + d) / 2 + gap)) break;
      }
    }
    at.push({ x, y });
    reach = Math.max(reach, Math.hypot(x, y) + d / 2);
  });
  return { at, reach };
}
let openedFocus: string | null = null;

const ARC_STEPS = 48;
const ARC_TINT = '#9CCBFF';

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function WorldGlobe({
  height,
  markers,
  sites,
  arcs = [],
  fills = [],
  focus,
  center,
  onSelect,
  onOpen,
  label,
}: {
  height: number;
  markers: GlobeMarker[];
  sites: GlobeSite[];
  arcs?: GlobeArc[];
  fills?: GlobeFill[];
  focus: string | null;
  center: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  /** Open a person's profile (a tap on their portrait). */
  onOpen: (id: string) => void;
  label: string;
}) {
  const host = useRef<HTMLElement | null>(null);
  // Props the frame loop reads without re-subscribing.
  // Each flow sampled once along its great circle (the frame loop only projects the points).
  const arcKey = arcs.map((a) => `${a.key}:${a.weight}:${a.risk ? 1 : 0}`).join('|');
  const paths = useMemo(
    () =>
      arcs.map((a) => {
        const at = geoInterpolate([a.from.lng, a.from.lat], [a.to.lng, a.to.lat]);
        return { arc: a, points: Array.from({ length: ARC_STEPS + 1 }, (_, i) => at(i / ARC_STEPS)) };
      }),
    [arcKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const live = useRef({ markers, sites, paths, focus, onSelect, onOpen });
  live.current = { markers, sites, paths, focus, onSelect, onOpen };

  // Shaded countries live on the planet itself; cleared when World goes.
  const fillKey = fills.map((f) => `${f.iso2}:${f.strength}:${f.risk ? 1 : 0}`).join('|');
  useEffect(() => {
    scene.fills = fills;
    scene.fillsVersion++;
    scene.invalidate?.();
  }, [fillKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      scene.fills = [];
      scene.fillsVersion++;
    },
    [],
  );
  const tween = useRef<{ lat: number; lng: number; zoom: number } | null>(null);

  // Turn toward the chosen person (or the place in question) and lean in a little.
  useEffect(() => {
    // Choosing someone else closes the fanned bubble (coming back from a profile keeps it).
    if (focus !== openedFocus) opened = null;
    openedFocus = focus;
    // Choosing a person flies in close over their headquarters; "Everyone" eases back out to the whole globe.
    if (center) tween.current = { lat: center.lat, lng: center.lng, zoom: focus ? 0.78 : scene.world.zoom };
    else if (!focus && scene.world.zoom > 0.3) tween.current = { lat: scene.world.lat, lng: scene.world.lng, zoom: 0 };
    scene.invalidate?.();
  }, [center?.lat, center?.lng, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = reducedMotion();
    const big = window.innerWidth >= 900;
    const S = big ? 52 : 44; // bubble size, px

    // Where the globe sits: centred in this area, as big as fits. Re-measured every frame, so the planet scrolls with
    // the page and the portraits, dots and gestures stay on it.
    let lastBox = '';
    const measure = (r = el.getBoundingClientRect()) => {
      // Hidden behind another screen (a profile): no box to measure, so keep the last good place.
      if (!r.width || !r.height) return;
      const key = `${r.left},${r.top},${r.width},${r.height}`;
      if (key === lastBox) return;
      lastBox = key;
      scene.world.centerX = (r.left + r.width / 2) / window.innerWidth;
      scene.world.centerY = (r.top + r.height / 2) / window.innerHeight;
      scene.world.radiusPx = Math.min(r.width, r.height) * 0.42;
      scene.invalidate?.();
    };
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    // Layers: places (canvas), joined bubbles (goo), portraits and counts.
    const dots = document.createElement('canvas');
    const goo = document.createElement('div');
    const faces = document.createElement('div');
    // The layers cover the whole viewport (moved each frame so their origin is the viewport's), so portraits reach
    // the screen edges instead of being cut at the globe area's box.
    // Clipped to the viewport: a portrait off screen (or behind the horizon) must never widen or lengthen the page,
    // or a drag would scroll into empty space (and on iOS shift the whole document, lifting the tab bar).
    dots.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    goo.style.cssText = `position:absolute;inset:0;overflow:hidden;pointer-events:none;filter:url(#${GOO_ID}) drop-shadow(0 8px 18px rgba(0,0,0,.55))`;
    faces.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;pointer-events:none';
    el.prepend(dots, goo, faces);

    const nodes = new Map<string, { blob: HTMLDivElement; face: HTMLDivElement; count: HTMLSpanElement; s: Spring; d: number; shown: number }>();
    let worthFrom: GlobeMarker[] | null = null;
    let worthOf = new Map<string, number>();
    const packs = new Map<string, { ks: string[]; sizes: number[]; at: { x: number; y: number }[]; reach: number }>();
    const nodeFor = (m: GlobeMarker) => {
      let n = nodes.get(m.key);
      if (n) return n;
      const blob = document.createElement('div');
      blob.style.cssText = `position:absolute;left:0;top:0;width:${S + 8}px;height:${S + 8}px;border-radius:50%;background:rgba(44,50,68,.96);will-change:transform,opacity`;
      const face = document.createElement('div');
      face.style.cssText = `position:absolute;left:0;top:0;width:${S}px;height:${S}px;border-radius:50%;overflow:visible;will-change:transform,opacity;` +
        `box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35)`;
      if (m.uri) {
        const img = document.createElement('img');
        img.src = m.uri;
        img.alt = '';
        img.draggable = false;
        img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;object-position:top;display:block';
        face.appendChild(img);
      } else {
        face.textContent = m.label.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
        face.style.cssText += `;display:flex;align-items:center;justify-content:center;background:#1C1E26;color:${color.textSecondary};font:600 ${Math.round(S * 0.36)}px Inter_600SemiBold, Inter, system-ui`;
      }
      const count = document.createElement('span');
      count.style.cssText = `position:absolute;right:-6px;top:-6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:${color.action};color:${color.onAction};` +
        `font:700 12px/22px Inter_700Bold, Inter, system-ui;text-align:center;display:none;box-shadow:0 2px 8px rgba(0,0,0,.4)`;
      face.appendChild(count);
      goo.appendChild(blob);
      faces.appendChild(face);
      n = { blob, face, count, s: { x: 0, y: 0, vx: 0, vy: 0, op: 0, scale: 1, init: false }, d: S, shown: S };
      nodes.set(m.key, n);
      return n;
    };

    // What a tap can hit, where it is drawn this frame: fanned people first (they sit on top), then bubbles.
    let hits: { x: number; y: number; r: number; keys: string[] }[] = [];
    let raf = 0;
    let last = performance.now();
    let dragging = false;
    let away = false; // World is behind another screen

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
      const w = scene.world;
      const t = tween.current;
      if (t && !dragging) {
        const k = reduce ? 1 : 1 - Math.exp(-dt * 4);
        w.lat += (t.lat - w.lat) * k;
        w.lng += wrap180(t.lng - w.lng) * k;
        w.zoom += (t.zoom - w.zoom) * k;
        if (Math.abs(t.lat - w.lat) + Math.abs(wrap180(t.lng - w.lng)) + Math.abs(t.zoom - w.zoom) < 0.01) tween.current = null;
        scene.invalidate?.();
      }
      const project = scene.project;
      if (!project) return;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) {
        away = true;
        hits = [];
        return;
      }
      if (away) {
        // Back on World: every portrait starts on its own place again (no stale merge offsets to spring from).
        away = false;
        for (const n of nodes.values()) n.s.init = false;
      }
      measure(box);
      // Portraits stay pinned to the planet but only show once the camera has nearly swung into the World view, so
      // coming back from another screen they fade in on the globe instead of riding the swing through space.
      const arrive = reduce ? 1 : Math.min(Math.max((scene.worldMix - 0.75) / 0.25, 0), 1);
      const { markers: ms, sites: ss, paths: ps, focus: f } = live.current;

      // Places: one dot per real site, faded with everyone else when a person is chosen.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const shift = `translate3d(${-box.left}px,${-box.top}px,0)`;
      for (const layer of [dots, goo, faces]) {
        layer.style.transform = shift;
        layer.style.width = `${vw}px`;
        layer.style.height = `${vh}px`;
      }
      if (dots.width !== Math.round(vw * dpr) || dots.height !== Math.round(vh * dpr)) {
        dots.width = Math.round(vw * dpr);
        dots.height = Math.round(vh * dpr);
      }
      const ctx = dots.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, vw, vh);
        for (const site of ss) {
          const p = project(site.lat, site.lng);
          // Visible right up to the horizon, then gone behind it.
          if (p.facing <= 0) continue;
          const a = Math.min(p.facing / 0.06, 1) * (f && site.group !== f ? FADED : 1);
          const r = site.kind === 'hq' ? 3.2 : 2.2;
          ctx.globalAlpha = a;
          ctx.fillStyle = site.live ? color.gain : '#9CCBFF';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Money flows: a soft line for the route, brighter dashes travelling along it toward headquarters. Drawn
        // segment by segment so each fades out at the horizon instead of crossing the planet's back.
        ctx.lineCap = 'round';
        const dash = reduce ? 0 : (now / 40) % 22;
        for (const { arc, points } of ps) {
          const faded = !!f && arc.group !== f;
          ctx.strokeStyle = arc.risk ? color.loss : f && !faded ? color.action : ARC_TINT;
          ctx.lineWidth = 1 + 3 * Math.sqrt(arc.weight);
          let prev: ReturnType<typeof project> | null = null;
          let along = 0;
          for (const [lng, lat] of points) {
            const p = project(lat, lng);
            if (prev && prev.facing > 0 && p.facing > 0) {
              const vis = Math.min(Math.min(prev.facing, p.facing) / 0.08, 1) * (faded ? FADED * 2 : 1);
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(p.x, p.y);
              ctx.setLineDash([]);
              ctx.globalAlpha = 0.28 * vis;
              ctx.stroke();
              if (!reduce) {
                ctx.setLineDash([8, 14]);
                ctx.lineDashOffset = along - dash;
                ctx.globalAlpha = 0.9 * vis;
                ctx.stroke();
              }
              along += Math.hypot(p.x - prev.x, p.y - prev.y); // keeps the dash pattern continuous across segments
            }
            prev = p;
          }
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      dots.style.opacity = goo.style.opacity = faces.style.opacity = String(arrive);

      // Portraits: project, then cluster greedily in importance order (the chosen person first, then by rank).
      if (worthFrom !== ms) {
        worthFrom = ms;
        worthOf = new Map(ms.map((m) => [m.key, m.worth ?? 0]));
      }
      const order = f ? [...ms.filter((m) => m.key === f), ...ms.filter((m) => m.key !== f)] : ms;
      const R = S * 0.9;
      const next: { x: number; y: number; keys: string[] }[] = [];
      // Screen-space grid (cell = merge radius): each portrait only checks its own and neighbouring cells.
      const grid = new Map<number, (typeof next)[number][]>();
      const cell = (x: number, y: number) => Math.floor(x / R) * 4096 + Math.floor(y / R);
      const pos = new Map<string, { x: number; y: number; vis: number }>();
      for (const m of order) {
        const p = project(m.lat, m.lng);
        // Full strength until the last few degrees before the horizon, then tucked behind it.
        const vis = Math.min(Math.max(p.facing / 0.06, 0), 1);
        const x = p.x;
        const y = p.y;
        pos.set(m.key, { x, y, vis });
        // Faded people (someone else is chosen) never merge: they stay where they are at 5%.
        if (vis <= 0 || (f && m.key !== f) || opened?.keys.has(m.key)) continue;
        const gx = Math.floor(x / R);
        const gy = Math.floor(y / R);
        let c: (typeof next)[number] | undefined;
        for (let i = -1; i <= 1 && !c; i++)
          for (let j = -1; j <= 1 && !c; j++) c = grid.get((gx + i) * 4096 + gy + j)?.find((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < R * R);
        if (c) c.keys.push(m.key);
        else {
          const nc = { x, y, keys: [m.key] };
          next.push(nc);
          const key = cell(x, y);
          grid.set(key, [...(grid.get(key) ?? []), nc]);
        }
      }
      const leaderOf = new Map<string, (typeof next)[number]>();
      for (const c of next) for (const k of c.keys) leaderOf.set(k, c);

      // The fanned bubble: its people still crowd by distance, but each crowd is spread around its centre (a ring, or
      // a sunflower spiral past six) with a clear gap, so every portrait can be tapped however close their HQs are.
      // Zooming in splits them further on their own; zooming back out past where it opened closes it.
      if (opened && w.zoom < opened.zoom - 0.15) opened = null;
      const fan = new Map<string, { x: number; y: number; d: number }>();
      if (opened) {
        const crowds: { x: number; y: number; keys: string[] }[] = [];
        for (const m of order) {
          const p = pos.get(m.key)!;
          if (!opened.keys.has(m.key) || p.vis <= 0) continue;
          const g = crowds.find((k) => (k.x / k.keys.length - p.x) ** 2 + (k.y / k.keys.length - p.y) ** 2 < R * R);
          if (g) {
            g.x += p.x;
            g.y += p.y;
            g.keys.push(m.key);
          } else crowds.push({ x: p.x, y: p.y, keys: [m.key] });
        }
        // Diameters: up to ~30% of the short side for the richest in the bubble, half that for the least wealthy.
        const short = Math.min(window.innerWidth, window.innerHeight);
        const maxD = Math.min(big ? 136 : 108, short * 0.3);
        const minD = Math.max(S + 6, maxD * 0.5);
        let top = 0;
        for (const k of opened.keys) top = Math.max(top, worthOf.get(k) ?? 0);
        const size = (k: string) => Math.round(minD + (maxD - minD) * Math.sqrt(top > 0 ? Math.max(worthOf.get(k) ?? 0, 0) / top : 0));
        const layout = (keys: string[]) => {
          const ks = [...keys].sort((a, b) => (worthOf.get(b) ?? 0) - (worthOf.get(a) ?? 0));
          const sizes = ks.map(size);
          const id = `${ks.join('|')}:${sizes.join(',')}`;
          let l = packs.get(id);
          if (!l) {
            if (packs.size > 64) packs.clear();
            l = { ks, sizes, ...packFan(sizes, 10) };
            packs.set(id, l);
          }
          return l;
        };
        // Crowds whose spreads would touch become one crowd.
        for (let merged = true; merged; ) {
          merged = false;
          for (let i = 0; i < crowds.length && !merged; i++)
            for (let j = i + 1; j < crowds.length && !merged; j++) {
              const a = crowds[i];
              const b = crowds[j];
              const d = Math.hypot(a.x / a.keys.length - b.x / b.keys.length, a.y / a.keys.length - b.y / b.keys.length);
              if (d < layout(a.keys).reach + layout(b.keys).reach + 6) {
                a.x += b.x;
                a.y += b.y;
                a.keys.push(...b.keys);
                crowds.splice(j, 1);
                merged = true;
              }
            }
        }
        // Each crowd shrinks to fit if it must and slides in from the edges, so nobody is cut off. Horizontally it stays
        // within the globe's area when that is a real column (desktop: clear of the panel beside it).
        const margin = space.md;
        const [lo, hi] = box.width >= 320 ? [box.left, box.right] : [0, window.innerWidth];
        const room = Math.min(hi - lo, window.innerHeight) / 2 - margin;
        for (const g of crowds) {
          const l = layout(g.keys);
          const k = Math.min(1, room / l.reach);
          const ext = l.reach * k + margin;
          const cx = Math.min(Math.max(g.x / g.keys.length, lo + ext), hi - ext);
          const cy = Math.min(Math.max(g.y / g.keys.length, ext), window.innerHeight - ext);
          l.ks.forEach((key, i) => fan.set(key, { x: cx + l.at[i].x * k, y: cy + l.at[i].y * k, d: l.sizes[i] * k }));
        }
      }
      const fannedHits: typeof hits = [];
      const bubbleHits: typeof hits = [];

      // Portraits are pinned to their place on the globe every frame (no lag while it turns). Only the merge/split
      // offset, from the portrait's own place to its cluster's centre, is sprung, with a slight overshoot.
      for (const m of order) {
        const n = nodeFor(m);
        const p = pos.get(m.key)!;
        const c = leaderOf.get(m.key);
        const isLeader = !!c && c.keys[0] === m.key;
        const fp = fan.get(m.key);
        const tx = fp ? fp.x : c ? c.x : p.x;
        const ty = fp ? fp.y : c ? c.y : p.y;
        const faded = !!f && m.key !== f;
        // While a bubble is fanned open, everyone outside it steps back so the fan reads clearly.
        const behind = !!opened && !fp ? 0.3 : 1;
        const targetOp = p.vis * behind * (faded ? FADED : c && !isLeader ? 0 : 1);
        const s = n.s; // s.x / s.y: the sprung offset from the portrait's own place
        const ox = tx - p.x;
        const oy = ty - p.y;
        if (!s.init || reduce) {
          s.x = ox;
          s.y = oy;
          s.vx = s.vy = 0;
          s.init = true;
        } else {
          // Stiff and well damped: a quick merge with a small bounce, not jelly.
          const k = 320;
          const d = 26;
          s.vx += (k * (ox - s.x) - d * s.vx) * dt;
          s.vy += (k * (oy - s.y) - d * s.vy) * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
        }
        const x = p.x + s.x;
        const y = p.y + s.y;
        s.op += (targetOp - s.op) * (reduce ? 1 : 1 - Math.exp(-dt * 10));
        const blobOp = faded ? 0 : p.vis * behind;
        // Diameter eases toward its fanned size (or back to the bubble size); real width/height keep photos sharp.
        const dTarget = fp ? fp.d : S;
        n.d = reduce ? dTarget : n.d + (dTarget - n.d) * (1 - Math.exp(-dt * 12));
        const d = Math.round(n.d);
        if (d !== n.shown) {
          n.shown = d;
          n.face.style.width = n.face.style.height = `${d}px`;
          n.blob.style.width = n.blob.style.height = `${d + 8}px`;
        }
        n.blob.style.transform = `translate3d(${x - (d + 8) / 2}px,${y - (d + 8) / 2}px,0)`;
        n.blob.style.opacity = String(blobOp);
        n.face.style.transform = `translate3d(${x - d / 2}px,${y - d / 2}px,0) scale(${c && !isLeader ? 0.7 : 1})`;
        n.face.style.opacity = String(s.op);
        n.face.style.zIndex = fp ? '3' : isLeader ? '2' : '1';
        const more = isLeader && c!.keys.length > 1 ? c!.keys.length - 1 : 0;
        n.count.style.display = more ? 'block' : 'none';
        if (more) n.count.textContent = `+${more}`;
        if (fp && p.vis > 0) fannedHits.push({ x, y, r: d / 2, keys: [m.key] });
        else if (isLeader) bubbleHits.push({ x, y, r: S / 2, keys: c!.keys });
      }
      hits = arrive > 0.5 ? [...fannedHits, ...bubbleHits] : [];
    };
    raf = requestAnimationFrame(frame);

    // Gestures. Drag turns the globe; pinch / ctrl+wheel / Safari gestures zoom it.
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number } | null = null;
    let moved = false; // once a drag passes 6 px it's a turn, even if it ends near where it started
    let pinch: { d: number; zoom: number } | null = null;
    const degPerPx = () => 57.3 / (scene.world.radiusPx * zoomFactor(scene.world.zoom));
    const zoomBy = (dz: number) => {
      tween.current = null;
      scene.world.zoom = clampZoom(scene.world.zoom + dz);
      scene.invalidate?.();
    };
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        down = { x: e.clientX, y: e.clientY, t: performance.now() };
        moved = false;
      } else down = null; // a second finger: a pinch, never a tap
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: scene.world.zoom };
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        scene.world.zoom = clampZoom(pinch.zoom + Math.log2(Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) / 2.32);
        tween.current = null;
      } else if (pointers.size === 1) {
        if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true;
        dragging = true;
        tween.current = null;
        const k = degPerPx();
        scene.world.lng = wrap180(scene.world.lng - (e.clientX - prev.x) * k);
        scene.world.lat = Math.min(Math.max(scene.world.lat + (e.clientY - prev.y) * k, -75), 75);
      }
      scene.invalidate?.();
    };
    const onUp = (e: PointerEvent) => {
      // A cancelled pointer (the browser took the gesture) is never a tap.
      if (e.type === 'pointercancel') down = null;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size) return;
      dragging = false;
      // A tap: a portrait opens the profile; a "+N" bubble leans in a little and fans its people out; open space closes
      // the fanned bubble, then the chosen person.
      if (down && !moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 400) {
        const x = e.clientX;
        const y = e.clientY;
        const hit = hits.find((h) => Math.hypot(h.x - x, h.y - y) < h.r + 4);
        const { focus: f, onSelect: select, onOpen: openProfile, markers: ms } = live.current;
        if (hit && hit.keys.length > 1) {
          const inside = ms.filter((m) => hit.keys.includes(m.key));
          const lat = inside.reduce((a, m) => a + m.lat, 0) / inside.length;
          const lng = inside[0].lng + inside.reduce((a, m) => a + wrap180(m.lng - inside[0].lng), 0) / inside.length;
          const zoom = clampZoom(scene.world.zoom + 0.12);
          opened = { keys: new Set(hit.keys), zoom };
          tween.current = { lat, lng, zoom };
        } else if (hit) openProfile(hit.keys[0]);
        else if (opened) opened = null;
        else if (f) select(null);
        scene.invalidate?.();
      }
      down = null;
    };
    const onWheel = (e: WheelEvent) => {
      // Trackpad pinches arrive as ctrl+wheel: zoom the globe and keep the page from zooming. Plain wheel scrolls the page.
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(-e.deltaY * 0.006); // a full trackpad pinch is ~150 units of deltaY
    };
    let gestureZoom = 0;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureZoom = scene.world.zoom;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale: number }).scale;
      scene.world.zoom = clampZoom(gestureZoom + Math.log2(scale) / 2.32);
      tween.current = null;
      scene.invalidate?.();
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      dots.remove();
      goo.remove();
      faces.remove();
    };
  }, []);

  const zoom = (dz: number) => {
    tween.current = null;
    scene.world.zoom = clampZoom(scene.world.zoom + dz);
    scene.invalidate?.();
  };

  return (
    <View
      ref={host as never}
      style={[styles.area, { height }]}
      accessibilityRole="image"
      accessibilityLabel={label}>
      <View style={styles.zoom}>
        <ZoomButton label="+" a11y="Zoom in" onPress={() => zoom(0.2)} />
        <ZoomButton label="−" a11y="Zoom out" onPress={() => zoom(-0.2)} />
      </View>
    </View>
  );
}

function ZoomButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={4}>
      <Glass radius={radius.pill} style={styles.zoomBtn}>
        <Text style={styles.zoomText}>{label}</Text>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // touch-action none: every gesture over the globe is ours (turn in any direction, pinch), so a turn never becomes a
  // page scroll halfway. The page scrolls from anywhere else.
  // Its own stacking context at z 0: portraits stay below glass (z 1) wherever they spill over the page.
  area: { position: 'relative', zIndex: 0, isolation: 'isolate', overflow: 'visible', touchAction: 'none', cursor: 'grab', userSelect: 'none' } as object,
  zoom: { position: 'absolute', right: space.sm, bottom: space.sm, gap: space.sm, zIndex: 3 },
  zoomBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontFamily: font.semibold, fontSize: 22, lineHeight: 24, color: color.text },
});
