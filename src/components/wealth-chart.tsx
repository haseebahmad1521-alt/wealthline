import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Caption, Icon, icons, minTouch } from '@/components/ui';
import { formatDate, formatTime, usd } from '@/lib/format';
import type { Live, Point } from '@/lib/live';
import { color, font, radius, space, type } from '@/theme';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const MIN_SPAN = 30_000; // zoom in to seconds
const HEIGHT = 200;
const PAD = { top: 16, bottom: 22, left: 4, right: 4 };

const presets = [
  { label: '3H', span: 3 * 60 * MIN },
  { label: '1D', span: DAY },
  { label: '1M', span: 30 * DAY },
  { label: '1Y', span: 365 * DAY },
  { label: 'All', span: Infinity },
] as const;

type Props = {
  /** All values, oldest first: observations (computed) and dated estimates. */
  points: (Point & { estimate: boolean })[];
  live: Live;
  now: number;
};

/**
 * Pan (drag) and zoom (pinch, wheel, or +/−) from 30 seconds to all-time.
 * Solid line = interpolation between real values (dots mark the values themselves when sparse);
 * dashed grey = projection from the latest observed trend. Nothing else is drawn.
 */
export function WealthChart({ points, live, now }: Props) {
  const first = points[0]?.t ?? now - presets[0].span;
  const fullSpan = Math.max(now - first, MIN_SPAN);
  const [span, setSpan] = useState<number>(presets[0].span);
  const [end, setEnd] = useState<number | null>(null); // null = follow now
  const [width, setWidth] = useState(0);
  const effSpan = Math.min(span, fullSpan * 1.05);
  const right = end ?? now;
  const left = right - effSpan;

  // Gesture state lives in refs so the responder doesn't need recreating.
  const view = useRef({ span: effSpan, right, now, width, fullSpan, first });
  view.current = { span: effSpan, right, now, width, fullSpan, first };
  const start = useRef<{ right: number; span: number; dist: number | null }>({ right, span: effSpan, dist: null });

  function clampRight(r: number, s: number) {
    const v = view.current;
    return Math.min(Math.max(r, v.first + s * 0.1), v.now);
  }
  function apply(r: number, s: number) {
    const v = view.current;
    const ns = Math.min(Math.max(s, MIN_SPAN), v.fullSpan * 1.05);
    const nr = clampRight(r, ns);
    setSpan(ns);
    setEnd(nr >= v.now - ns * 0.01 ? null : nr); // reaching the present re-attaches to live
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          start.current = { right: view.current.right, span: view.current.span, dist: pinchDist(e) };
        },
        onPanResponderMove: (e, g) => {
          const s = start.current;
          const d = pinchDist(e);
          if (d && s.dist) {
            apply(s.right, (s.span * s.dist) / d);
          } else if (view.current.width) {
            apply(s.right - (g.dx / view.current.width) * s.span, s.span);
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Web: wheel / trackpad pinch zooms around the right edge.
  const box = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = box.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (ev: WheelEvent) => {
      if (Math.abs(ev.deltaY) < Math.abs(ev.deltaX)) {
        ev.preventDefault();
        const v = view.current;
        apply(v.right + (ev.deltaX / Math.max(v.width, 1)) * v.span, v.span);
      } else if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        const v = view.current;
        apply(v.right, v.span * Math.exp(ev.deltaY * 0.01));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visible values plus one neighbour each side so lines run to the edges.
  const firstIn = points.findIndex((p) => p.t >= left);
  const lastIn = points.findLastIndex((p) => p.t <= right);
  const visible =
    firstIn === -1 || lastIn === -1 ? [] : points.slice(Math.max(0, firstIn - 1), Math.min(points.length, lastIn + 2));
  const inWindow = visible.filter((p) => p.t >= left && p.t <= right);
  const proj = live.projection && live.projection.to.t >= left && live.projection.from.t <= right ? live.projection : null;

  const values = [...inWindow.map((p) => p.v), ...(proj ? [proj.from.v, proj.to.v] : [])];
  // Include the edge neighbours' interpolated span so the line never leaves the plot.
  for (const p of visible) values.push(p.v);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const padV = (hi - lo || Math.abs(hi) * 0.002 || 1) * 0.12;
  const yMin = lo - padV;
  const yMax = hi + padV;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const x = (t: number) => PAD.left + ((t - left) / effSpan) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (HEIGHT - PAD.top - PAD.bottom);

  const linePath = visible.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const showDots = inWindow.length > 0 && inWindow.length <= 60;
  const latest = inWindow.at(-1);
  const trend = latest && inWindow[0] ? latest.v - inWindow[0].v : 0;
  const lineColor = trend > 0 ? color.gain : trend < 0 ? color.loss : color.text;

  const summary =
    inWindow.length === 0
      ? `No recorded values between ${describe(left)} and ${describe(right)}.`
      : `${inWindow.length} recorded value${inWindow.length > 1 ? 's' : ''} from ${describe(left)} to ${describe(right)}, ` +
        `${usd(inWindow[0].v)} to ${usd(latest!.v)}${proj ? `, then projected to ${usd(proj.to.v)}` : ''}.`;

  const activePreset = end == null ? presets.find((p) => Math.min(p.span, fullSpan * 1.05) === effSpan)?.label : undefined;

  return (
    <View style={styles.wrap}>
      <View accessibilityRole="tablist" style={styles.presets}>
        {presets.map((p) => {
          const selected = activePreset === p.label;
          return (
            <Pressable
              key={p.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={p.span === Infinity ? 'All time' : `Last ${p.label}`}
              onPress={() => {
                setSpan(p.span);
                setEnd(null);
              }}
              style={[styles.preset, selected && styles.presetOn]}>
              <Text style={[styles.presetLabel, selected && { color: color.text }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View
        ref={box}
        {...responder.panHandlers}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Net worth chart. ${summary}`}
        accessibilityHint="Swipe up or down to zoom. Drag horizontally to move through time."
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => apply(right, e.nativeEvent.actionName === 'increment' ? effSpan / 2 : effSpan * 2)}
        style={styles.plot}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={PAD.top + f * (HEIGHT - PAD.top - PAD.bottom)}
                y2={PAD.top + f * (HEIGHT - PAD.top - PAD.bottom)}
                stroke={color.hairline}
                strokeWidth={StyleSheet.hairlineWidth}
              />
            ))}
            {visible.length > 1 && <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" />}
            {showDots &&
              inWindow.map((p) => (
                <Circle
                  key={p.t}
                  cx={x(p.t)}
                  cy={y(p.v)}
                  r={p.estimate ? 4 : 2.5}
                  fill={p.estimate ? color.surface : lineColor}
                  stroke={lineColor}
                  strokeWidth={p.estimate ? 2 : 0}
                />
              ))}
            {proj && (
              <>
                <Path
                  d={`M${x(proj.from.t)},${y(proj.from.v)}L${x(proj.to.t)},${y(proj.to.v)}`}
                  stroke={color.projected}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill="none"
                />
                <Circle cx={x(proj.to.t)} cy={y(proj.to.v)} r={3.5} fill={color.surface} stroke={color.projected} strokeWidth={1.5} />
                <SvgText
                  x={Math.min(x(proj.to.t), width - PAD.right) - 4}
                  y={Math.max(y(proj.to.v) - 10, 12)}
                  textAnchor="end"
                  fontSize={11}
                  fontFamily={font.medium}
                  fill={color.projected}>
                  Projected
                </SvgText>
              </>
            )}
            <SvgText x={PAD.left} y={HEIGHT - 6} fontSize={11} fontFamily={font.regular} fill={color.textSecondary}>
              {describe(left)}
            </SvgText>
            <SvgText x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={11} fontFamily={font.regular} fill={color.textSecondary}>
              {end == null ? 'Now' : describe(right)}
            </SvgText>
          </Svg>
        )}
        {inWindow.length === 0 && !proj && (
          <View style={styles.emptyOverlay} pointerEvents="box-none">
            <Text style={[type.headline, { color: color.text }]}>No recorded values in this window.</Text>
            <Caption>
              {points.length
                ? `Latest value ${usd(points.at(-1)!.v)}, ${points.at(-1)!.estimate ? 'estimate' : 'observed'} ${describe(points.at(-1)!.t)}. Values are never filled in.`
                : 'No values have been recorded for this person yet.'}
            </Caption>
            {points.length > 0 && (
              <Pressable accessibilityRole="button" onPress={() => { setSpan(Infinity); setEnd(null); }} style={styles.linkButton}>
                <Text style={[type.headline, { color: color.action }]}>Show all time</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <LegendItem label="Recorded" swatch={<View style={[styles.swatchLine, { backgroundColor: color.text }]} />} />
          <LegendItem label="Estimate" swatch={<View style={styles.swatchRing} />} />
          <LegendItem label="Projected" swatch={<View style={styles.swatchDash} />} />
        </View>
        <View style={styles.zoom}>
          <ZoomButton label="Zoom out" icon={icons.minus} onPress={() => apply(right, effSpan * 2)} />
          <ZoomButton label="Zoom in" icon={icons.plus} onPress={() => apply(right, effSpan / 2)} />
        </View>
      </View>
    </View>
  );
}

function pinchDist(e: GestureResponderEvent) {
  const t = e.nativeEvent.touches;
  return t && t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : null;
}

function describe(t: number) {
  return Date.now() - t < DAY ? formatTime(new Date(t)) : formatDate(new Date(t));
}

function LegendItem({ label, swatch }: { label: string; swatch: React.ReactNode }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Caption>{label}</Caption>
    </View>
  );
}

function ZoomButton({ label, icon, onPress }: { label: string; icon: typeof icons.plus; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.zoomButton}>
      <Icon name={icon} size={16} tint={color.action} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  presets: { flexDirection: 'row', backgroundColor: color.fill, borderRadius: radius.pill, padding: 3, alignSelf: 'flex-start' },
  preset: { minHeight: minTouch - 8, minWidth: 48, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  presetOn: { backgroundColor: color.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  presetLabel: { fontFamily: font.semibold, fontSize: 13, color: color.textSecondary },
  plot: { height: HEIGHT, ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'pan-y' } as object) : null) },
  emptyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.lg },
  linkButton: { minHeight: minTouch, justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  legend: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchLine: { width: 16, height: 2, borderRadius: 1 },
  swatchRing: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: color.text },
  swatchDash: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.projected },
  zoom: { flexDirection: 'row', gap: space.xs },
  zoomButton: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
});
