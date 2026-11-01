// World on the real planet (owner, Nov 1, 2026): the planet scene turns to look straight at the globe, and this layer
// sits over World's globe area. Portraits sit at each person's main headquarters; when they crowd together on screen
// they slide into one joined bubble (an SVG "goo" filter fuses their glass circles, springs give the elastic overshoot)
// and split apart again as you zoom in. Company places are small dots: every one is a real site. Choosing a person
// fades everyone else to 5%. Pinch, ctrl+wheel (trackpad pinch) and Safari gestures zoom the globe, never the page.
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glass } from '@/components/glass';
import type { GlobeMarker, GlobeSite } from '@/components/globe';
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

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function WorldGlobe({
  height,
  markers,
  sites,
  focus,
  center,
  onSelect,
  label,
}: {
  height: number;
  markers: GlobeMarker[];
  sites: GlobeSite[];
  focus: string | null;
  center: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  label: string;
}) {
  const host = useRef<HTMLElement | null>(null);
  // Props the frame loop reads without re-subscribing.
  const live = useRef({ markers, sites, focus, onSelect });
  live.current = { markers, sites, focus, onSelect };
  const tween = useRef<{ lat: number; lng: number; zoom: number } | null>(null);

  // Turn toward the chosen person (or the place in question) and lean in a little.
  useEffect(() => {
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
    dots.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    goo.style.cssText = `position:absolute;inset:0;pointer-events:none;filter:url(#${GOO_ID}) drop-shadow(0 8px 18px rgba(0,0,0,.55))`;
    faces.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    el.prepend(dots, goo, faces);

    const nodes = new Map<string, { blob: HTMLDivElement; face: HTMLDivElement; count: HTMLSpanElement; s: Spring }>();
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
      n = { blob, face, count, s: { x: 0, y: 0, vx: 0, vy: 0, op: 0, scale: 1, init: false } };
      nodes.set(m.key, n);
      return n;
    };

    let clusters: { x: number; y: number; keys: string[]; lat: number; lng: number }[] = [];
    let raf = 0;
    let last = performance.now();
    let dragging = false;

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
      measure(box);
      const { markers: ms, sites: ss, focus: f } = live.current;

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
        ctx.globalAlpha = 1;
      }

      // Portraits: project, then cluster greedily in importance order (the chosen person first, then by rank).
      const order = f ? [...ms.filter((m) => m.key === f), ...ms.filter((m) => m.key !== f)] : ms;
      const R = S * 0.9;
      const next: typeof clusters = [];
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
        if (vis <= 0 || (f && m.key !== f)) continue;
        const gx = Math.floor(x / R);
        const gy = Math.floor(y / R);
        let c: (typeof next)[number] | undefined;
        for (let i = -1; i <= 1 && !c; i++)
          for (let j = -1; j <= 1 && !c; j++) c = grid.get((gx + i) * 4096 + gy + j)?.find((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < R * R);
        if (c) c.keys.push(m.key);
        else {
          const nc = { x, y, keys: [m.key], lat: m.lat, lng: m.lng };
          next.push(nc);
          const key = cell(x, y);
          grid.set(key, [...(grid.get(key) ?? []), nc]);
        }
      }
      clusters = next;
      const leaderOf = new Map<string, (typeof next)[number]>();
      for (const c of next) for (const k of c.keys) leaderOf.set(k, c);

      // Portraits are pinned to their place on the globe every frame (no lag while it turns). Only the merge/split
      // offset, from the portrait's own place to its cluster's centre, is sprung, with a slight overshoot.
      for (const m of order) {
        const n = nodeFor(m);
        const p = pos.get(m.key)!;
        const c = leaderOf.get(m.key);
        const isLeader = !!c && c.keys[0] === m.key;
        const tx = c ? c.x : p.x;
        const ty = c ? c.y : p.y;
        const faded = !!f && m.key !== f;
        const targetOp = p.vis * (faded ? FADED : c && !isLeader ? 0 : 1);
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
        const blobOp = faded ? 0 : p.vis;
        n.blob.style.transform = `translate3d(${x - (S + 8) / 2}px,${y - (S + 8) / 2}px,0)`;
        n.blob.style.opacity = String(blobOp);
        n.face.style.transform = `translate3d(${x - S / 2}px,${y - S / 2}px,0) scale(${c && !isLeader ? 0.7 : 1})`;
        n.face.style.opacity = String(s.op);
        n.face.style.zIndex = isLeader ? '2' : '1';
        const more = isLeader && c!.keys.length > 1 ? c!.keys.length - 1 : 0;
        n.count.style.display = more ? 'block' : 'none';
        if (more) n.count.textContent = `+${more}`;
      }
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
      // A tap: open the person, or zoom into a joined bubble so it splits.
      if (down && !moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 400) {
        const x = e.clientX;
        const y = e.clientY;
        const hit = clusters.find((c) => Math.hypot(c.x - x, c.y - y) < S / 2 + 4);
        const { focus: f, onSelect: select } = live.current;
        if (hit && hit.keys.length > 1) tween.current = { lat: hit.lat, lng: hit.lng, zoom: clampZoom(scene.world.zoom + 0.35) };
        else if (hit) select(hit.keys[0] === f ? null : hit.keys[0]);
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
  area: { position: 'relative', overflow: 'visible', touchAction: 'none', cursor: 'grab', userSelect: 'none' } as object,
  zoom: { position: 'absolute', right: space.sm, bottom: space.sm, gap: space.sm, zIndex: 3 },
  zoomBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontFamily: font.semibold, fontSize: 22, lineHeight: 24, color: color.text },
});
