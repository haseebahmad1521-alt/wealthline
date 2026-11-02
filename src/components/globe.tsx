// The World globe: real company sites as ripples, people as portraits at their main HQ, money flows as lines from
// where revenue is earned to the company's HQ, and countries shaded by a figure the screen chooses. Drawn with d3-geo
// into react-native-svg, so the same component runs on web, iOS and Android. Motion only ever means "this is a real
// site", "this company's price moved today" or "money flows this way"; it never stands in for data.
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Path, Text as SvgText } from 'react-native-svg';

import { countryShape, land, type LatLng } from '@/lib/geo';
import type { SiteKind } from '@/lib/world';
import { color } from '@/theme';

const graticule = geoGraticule10();

export type GlobeSite = { key: string; lat: number; lng: number; kind: SiteKind; group: string; live: boolean };
export type GlobeMarker = { key: string; lat: number; lng: number; uri: string | null; label: string; /** Net worth (USD); sizes portraits in an opened bubble. */ worth?: number | null };
/** A money flow: from where revenue is earned to the company's HQ. weight 0–1 sets the line width. */
export type GlobeArc = { key: string; from: LatLng; to: LatLng; weight: number; group: string; risk?: boolean };
/** A shaded country; strength 0–1. */
export type GlobeFill = { iso2: string; strength: number; risk?: boolean };

// Ring size by what the place is, not by any invented "influence" figure.
const BASE: Record<SiteKind, number> = { hq: 7, factory: 6, launch_site: 5.5, data_center: 5, research: 4.5, office: 4.5, store: 4, other: 4 };
const LAND = '#E3E4E9';
const SPIN_DEG_PER_MS = 0.004; // 4° a second
const IDLE_AFTER_DRAG_MS = 4000;

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

export function Globe({
  size,
  sites,
  markers,
  focus,
  center,
  onSelect,
  spin = true,
  label,
  arcs = [],
  fills = [],
}: {
  size: number;
  sites: GlobeSite[];
  markers: GlobeMarker[];
  arcs?: GlobeArc[];
  fills?: GlobeFill[];
  /** Group (person id) to bring forward; everything else fades. */
  focus: string | null;
  /** Where to turn the globe when focus changes. */
  center: { lat: number; lng: number } | null;
  onSelect?: (key: string) => void;
  spin?: boolean;
  label: string;
}) {
  const reduce = useReducedMotion();
  const rot = useRef<[number, number]>(center ? [-center.lng, clamp(-center.lat, -50, 50)] : [-20, -18]);
  const fly = useRef<{ from: [number, number]; to: [number, number]; start: number } | null>(null);
  const dragging = useRef(false);
  const idleUntil = useRef(0);
  const clock = useRef(0);
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((f) => (f + 1) % 1_000_000);

  // Turn to the focused empire along the shorter way round.
  useEffect(() => {
    if (!center) return;
    const [l0, p0] = rot.current;
    const target: [number, number] = [-center.lng, clamp(-center.lat, -50, 50)];
    const dl = ((((target[0] - l0) % 360) + 540) % 360) - 180;
    const to: [number, number] = [l0 + dl, target[1]];
    if (reduce) {
      rot.current = to;
      redraw();
    } else fly.current = { from: [l0, p0], to, start: performance.now() };
  }, [center?.lat, center?.lng, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  // One frame loop drives spin, the focus turn and the ripples (about 30 fps). Reduced motion: no loop at all.
  useEffect(() => {
    if (reduce) return;
    let id = 0;
    let last = performance.now();
    let drawn = 0;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const f = fly.current;
      if (f) {
        const k = Math.min((now - f.start) / 900, 1);
        const e = 1 - (1 - k) ** 3; // ease-out
        rot.current = [f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1] + (f.to[1] - f.from[1]) * e];
        if (k >= 1) fly.current = null;
      } else if (spin && !focus && !dragging.current && now > idleUntil.current) {
        rot.current = [rot.current[0] + dt * SPIN_DEG_PER_MS, rot.current[1]];
      }
      clock.current = now;
      if (now - drawn > 33) {
        drawn = now;
        redraw();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [reduce, spin, focus]);

  const sizeRef = useRef(size);
  sizeRef.current = size;
  const start = useRef<[number, number]>([0, 0]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Taps fall through to the portraits; a sideways drag turns the globe (and may then tilt it), while a
        // vertical swipe keeps scrolling the page on phones, where the globe fills the width.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragging.current = true;
          fly.current = null;
          start.current = [...rot.current];
        },
        onPanResponderMove: (_e, g) => {
          const k = 180 / sizeRef.current;
          rot.current = [start.current[0] + g.dx * k, clamp(start.current[1] - g.dy * k, -70, 70)];
          redraw();
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          idleUntil.current = performance.now() + IDLE_AFTER_DRAG_MS;
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
        },
      }),
    [],
  );

  const r = size / 2;
  const projection = geoOrthographic().scale(r - 1).translate([r, r]).rotate(rot.current).clipAngle(90);
  const path = geoPath(projection);
  const centre: [number, number] = [-rot.current[0], -rot.current[1]];
  const scale = clamp(size / 360, 0.75, 1.5);
  const t = clock.current;

  // How far round the limb a point sits: 1 facing us, fading to 0 over the last 35° before the edge, null when behind.
  // Near the edge the curve squeezes places into a sliver (a whole coast can sit there), so they fade out rather than
  // read as if they were somewhere else.
  const EDGE_FADE = (35 * Math.PI) / 180;
  const facing = (lng: number, lat: number) => {
    const d = geoDistance([lng, lat], centre);
    return d >= Math.PI / 2 ? null : clamp((Math.PI / 2 - d) / EDGE_FADE, 0, 1);
  };

  const rings = sites.flatMap((s) => {
    const vis = facing(s.lng, s.lat);
    const xy = vis != null ? projection([s.lng, s.lat]) : null;
    if (!xy) return [];
    const faded = !!focus && s.group !== focus;
    const tint = focus && !faded ? color.action : color.text;
    const strength = (faded ? 0.12 : s.live ? 0.6 : 0.34) * vis!;
    const period = s.live ? 1700 : 2600;
    const base = BASE[s.kind] * scale;
    const phases = reduce ? [0.3, 0.7] : [0, 0.5].map((o) => (t / period + o + hash(s.key)) % 1);
    return [
      <G key={s.key}>
        {phases.map((p, i) => (
          <Circle key={i} cx={xy[0]} cy={xy[1]} r={base * (0.5 + 2.2 * p)} fill="none" stroke={tint} strokeWidth={1.2} strokeOpacity={strength * (1 - p)} />
        ))}
        <Circle cx={xy[0]} cy={xy[1]} r={1.9 * scale} fill={tint} fillOpacity={(faded ? 0.25 : 0.9) * vis!} />
      </G>,
    ];
  });

  // Countries shaded by the screen's figure (Economies: revenue there as a share of GDP; What if: the shocked place).
  const shading = fills.flatMap((f) => {
    const shape = countryShape(f.iso2);
    const d = shape ? path(shape) : null;
    return d ? [<Path key={`fill-${f.iso2}`} d={d} fill={f.risk ? color.loss : color.text} fillOpacity={f.risk ? 0.35 : 0.08 + 0.55 * f.strength} stroke={color.surface} strokeWidth={0.6} />] : [];
  });

  // Money flows along great circles (clipped at the horizon); dashes travel toward the HQ.
  const flows = arcs.flatMap((a) => {
    const d = path({ type: 'LineString', coordinates: [[a.from.lng, a.from.lat], [a.to.lng, a.to.lat]] });
    if (!d) return [];
    const faded = !!focus && a.group !== focus;
    const tint = a.risk ? color.loss : focus && !faded ? color.action : color.text;
    const width = (1 + 3.5 * Math.sqrt(a.weight)) * scale;
    // A soft solid line shows the route; brighter dashes travelling along it show the direction (toward the HQ).
    return [
      <G key={a.key}>
        <Path d={d} fill="none" stroke={tint} strokeOpacity={faded ? 0.08 : 0.22} strokeWidth={width} strokeLinecap="round" />
        <Path
          d={d}
          fill="none"
          stroke={tint}
          strokeOpacity={faded ? 0.15 : 0.85}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={reduce ? undefined : '8 14'}
          strokeDashoffset={reduce ? undefined : -((t / 30) % 22)}
        />
      </G>,
    ];
  });

  // Portraits at HQs, only well inside the front (65° from centre); people sharing a city fan out around it.
  const placed = markers.flatMap((m) => {
    const vis = facing(m.lng, m.lat);
    const xy = vis != null && geoDistance([m.lng, m.lat], centre) < (65 * Math.PI) / 180 ? projection([m.lng, m.lat]) : null;
    return xy ? [{ ...m, x: xy[0], y: xy[1], vis: vis! }] : [];
  });
  const at = new Map<string, number>();
  const pins = placed.map((m) => {
    const cell = `${Math.round(m.x / 18)}:${Math.round(m.y / 18)}`;
    const n = at.get(cell) ?? 0;
    at.set(cell, n + 1);
    const on = focus === m.key;
    const d = (on ? 40 : 28) * scale;
    const x = m.x + (n ? Math.cos(n * 2.4) * d * 0.8 : 0);
    const y = m.y - d * 0.75 + (n ? Math.sin(n * 2.4) * d * 0.8 : 0);
    const faded = !!focus && !on;
    return (
      <G key={m.key} opacity={(faded ? 0.45 : 1) * m.vis} onPress={onSelect ? () => onSelect(m.key) : undefined}>
        <Circle cx={x} cy={y} r={d / 2 + 2} fill={color.surface} stroke={on ? color.action : color.hairline} strokeWidth={on ? 2 : 1} />
        {m.uri ? (
          <>
            <Defs>
              <ClipPath id={`clip-${m.key}`}>
                <Circle cx={x} cy={y} r={d / 2} />
              </ClipPath>
            </Defs>
            <SvgImage href={m.uri} x={x - d / 2} y={y - d / 2} width={d} height={d} preserveAspectRatio="xMidYMin slice" clipPath={`url(#clip-${m.key})`} />
          </>
        ) : (
          // No free portrait: initials, as everywhere else in the app.
          <>
            <Circle cx={x} cy={y} r={d / 2} fill={color.fill} />
            <SvgText x={x} y={y + d * 0.13} fontSize={d * 0.36} fontWeight="600" fill={color.textSecondary} textAnchor="middle">
              {m.label
                .replace(/ & family$/, '')
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join('')}
            </SvgText>
          </>
        )}
      </G>
    );
  });

  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size, alignSelf: 'center', cursor: 'grab' } as never}>
      <Svg width={size} height={size}>
        <Circle cx={r} cy={r} r={r - 1} fill={color.surface} stroke={color.hairline} strokeWidth={1} />
        <Path d={path(graticule) ?? ''} fill="none" stroke={color.hairline} strokeWidth={0.6} strokeOpacity={0.7} />
        <Path d={path(land) ?? ''} fill={LAND} stroke={color.surface} strokeWidth={0.6} />
        {shading}
        {flows}
        {rings}
        {pins}
      </Svg>
    </View>
  );
}
