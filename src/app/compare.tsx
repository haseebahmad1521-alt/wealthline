import { Link, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { presets, RangePicker } from '@/components/wealth-chart';
import { Body, Caption, Change, Heading, Icon, Portrait, Screen, StateView, Surface, icons, minTouch } from '@/components/ui';
import { growth, indexed, MAX_COMPARE, pctDiff, recordedTimes, SERIES_COLORS, valueAt } from '@/lib/compare';
import { useMoney } from '@/lib/currency';
import { useHoldings, usePeople, useValuesFor, type Person } from '@/lib/data';
import { formatDate } from '@/lib/format';
import type { Point } from '@/lib/live';
import { color, font, radius, space, type } from '@/theme';

type Series = { person: Person; color: string; points: Point[] };
type Mode = 'value' | 'growth';

export default function Compare() {
  const { ids: raw } = useLocalSearchParams<{ ids?: string }>();
  const ids = (raw ?? '').split(',').filter(Boolean).slice(0, MAX_COMPARE);
  const people = usePeople();
  const values = useValuesFor(ids);
  const money = useMoney();
  const [mode, setMode] = useState<Mode>('value');
  const narrow = useWindowDimensions().width < 420;

  const chosen = ids.map((id) => people.data?.find((p) => p.id === id)).filter((p): p is Person => !!p);
  if (people.isPending || values.some((v) => v.isPending)) return <Screen><StateView loading /></Screen>;
  const error = people.error ?? values.find((v) => v.error)?.error;
  if (error) return <Screen><StateView error={error} onRetry={() => void people.refetch()} /></Screen>;
  if (chosen.length < 2) {
    return (
      <Screen>
        <StateView empty={{ title: 'Pick at least two people.', body: 'Use Compare on Rankings to choose 2–3 people.' }} />
      </Screen>
    );
  }

  const series: Series[] = chosen.map((person, i) => ({
    person,
    color: SERIES_COLORS[i],
    points: (values[ids.indexOf(person.id)]?.data ?? []).map((v) => ({ t: Date.parse(v.as_of), v: Number(v.net_worth_usd) })),
  }));
  const pct = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`);

  return (
    <Screen>
      <View>
        <Heading>Compare.</Heading>
        <Body secondary>Dated estimates only. Lines join recorded values; nothing is filled in or projected.</Body>
      </View>

      <Surface style={styles.list}>
        {series.map((s, i) => (
          <View key={s.person.id} style={[styles.personRow, i > 0 && styles.divided]}>
            <View accessibilityLabel={`${s.person.name}, selected for comparison`}>
              <Portrait uri={s.person.portrait_url} name={s.person.name} size={44} />
              <View style={styles.checkBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Icon name={icons.check} size={10} tint="#FFFFFF" />
              </View>
            </View>
            <View style={styles.identity}>
              <Link href={`/person/${s.person.slug}`} style={styles.cardName} numberOfLines={1}>
                {s.person.name}
              </Link>
              <Caption numberOfLines={1}>{s.person.as_of ? `Estimate as of ${formatDate(s.person.as_of)}` : 'No estimate yet'}</Caption>
            </View>
            <View style={styles.rowValue}>
              <Text style={[type.number, styles.cardValue]}>
                {s.person.net_worth_usd != null ? money.format(s.person.net_worth_usd) : '—'}
              </Text>
              {s.person.net_worth_usd != null && s.person.prev_net_worth_usd != null && (
                <Change delta={s.person.net_worth_usd - s.person.prev_net_worth_usd} base={s.person.prev_net_worth_usd} size={13} compact={narrow} />
              )}
            </View>
          </View>
        ))}
      </Surface>

      <Surface style={styles.chartCard}>
        <View accessibilityRole="tablist" style={styles.modes}>
          {(['value', 'growth'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => setMode(m)}
              style={[styles.mode, mode === m && styles.modeOn]}>
              <Text style={[styles.modeLabel, mode === m && { color: color.text }]}>{m === 'value' ? 'Net worth' : 'Change %'}</Text>
            </Pressable>
          ))}
        </View>
        <CompareChart series={series} mode={mode} format={(v) => (mode === 'value' ? money.format(v) : pct(v))} />
      </Surface>

      <Heading level={2}>Differences.</Heading>
      <Surface style={styles.list}>
        {series.flatMap((a, i) =>
          series.slice(i + 1).map((b) => {
            const av = a.person.net_worth_usd;
            const bv = b.person.net_worth_usd;
            const [big, small] = (av ?? 0) >= (bv ?? 0) ? [a, b] : [b, a];
            const d = big.person.net_worth_usd != null && small.person.net_worth_usd != null ? pctDiff(big.person.net_worth_usd, small.person.net_worth_usd) : null;
            const ga = growth(a.points);
            const gb = growth(b.points);
            return (
              <View key={a.person.id + b.person.id} style={styles.row}>
                <Text style={[type.body, { color: color.text }]}>
                  {big.person.name} is <Text style={type.number}>{pct(d)}</Text> larger than {small.person.name}
                  {d != null && big.person.net_worth_usd != null && small.person.net_worth_usd != null
                    ? ` (${money.format(big.person.net_worth_usd - small.person.net_worth_usd)} more).`
                    : '.'}
                </Text>
                <Caption>
                  Growth over recorded history: {a.person.name} {pct(ga)}, {b.person.name} {pct(gb)}
                  {ga != null && gb != null ? `, a gap of ${Math.abs(ga - gb).toFixed(1)} points.` : '.'}
                </Caption>
              </View>
            );
          }),
        )}
      </Surface>

      <Heading level={2}>Holdings.</Heading>
      <View style={styles.cards}>
        {series.map((s) => (
          <HoldingsCard key={s.person.id} series={s} />
        ))}
      </View>

      <Heading level={2}>Photos.</Heading>
      <Surface style={styles.list}>
        {series.map((s) => (
          <PhotoCredit key={s.person.id} person={s.person} />
        ))}
      </Surface>

      <Heading level={2}>Data.</Heading>
      <DataTable series={series} format={money.format} />
    </Screen>
  );
}

function PhotoCredit({ person }: { person: Person }) {
  if (!person.portrait_page_url) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${person.name}: photo by ${person.portrait_author ?? 'unknown'}, ${person.portrait_license ?? ''}. Opens the source and license.`}
      onPress={() => void WebBrowser.openBrowserAsync(person.portrait_page_url!)}
      style={[styles.row, styles.creditRow]}>
      <Text style={[type.caption, { color: color.action, flex: 1 }]}>
        {person.name}: {person.portrait_author} · {person.portrait_license}
      </Text>
      <Icon name={icons.link} size={12} tint={color.action} />
    </Pressable>
  );
}

function HoldingsCard({ series }: { series: Series }) {
  const holdings = useHoldings(series.person.id);
  return (
    <Surface style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={[type.headline, { color: color.text, flex: 1 }]} numberOfLines={1}>{series.person.name}</Text>
      </View>
      {holdings.data?.length ? (
        holdings.data.map((h) => (
          <Caption key={h.id}>
            {h.company}
            {h.ticker ? ` (${h.ticker})` : ''}
            {h.role ? ` · ${h.role}` : ''}
          </Caption>
        ))
      ) : (
        <Caption>{holdings.isPending ? 'Loading…' : 'No verified holdings recorded yet.'}</Caption>
      )}
    </Surface>
  );
}

/** The chart's numbers as a table: every recorded date, every person (the chart is never the only way in). */
function DataTable({ series, format }: { series: Series[]; format: (v: number) => string }) {
  const times = recordedTimes(series.map((s) => s.points)).reverse();
  return (
    <Surface style={styles.list}>
      <View style={[styles.tableRow, styles.tableHead]} accessibilityRole="header">
        <Caption style={styles.dateCol}>Date</Caption>
        {series.map((s) => (
          <Caption key={s.person.id} style={styles.valueCol} numberOfLines={1}>{s.person.name.split(' ').at(-1)}</Caption>
        ))}
      </View>
      {times.map((t) => (
        <View key={t} style={styles.tableRow}>
          <Caption style={styles.dateCol}>{formatDate(new Date(t))}</Caption>
          {series.map((s) => {
            const exact = s.points.find((p) => p.t === t);
            return (
              <Text key={s.person.id} style={[type.number, styles.valueCol, { color: exact ? color.text : color.textSecondary }]}>
                {exact ? format(exact.v) : '—'}
              </Text>
            );
          })}
        </View>
      ))}
    </Surface>
  );
}

const H = 240;
const WIDE_PAD = { top: 16, bottom: 24, left: 60, right: 92 };
const NARROW_PAD = { top: 16, bottom: 24, left: 44, right: 12 };

/** One axis, 2px lines, recorded values marked, direct end labels, scrub readout snapped to recorded dates. */
function CompareChart({ series, mode, format }: { series: Series[]; mode: Mode; format: (v: number) => string }) {
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [span, setSpan] = useState<number>(Infinity);
  const narrow = width > 0 && width < 420;
  const PAD = narrow ? NARROW_PAD : WIDE_PAD;
  const axis = (v: number) => (narrow && mode === 'value' ? format(v).replace(/\.\d(?=[BTM]$)/, '') : format(v));
  const plotted = series.map((s) => ({ ...s, pts: mode === 'growth' ? indexed(s.points) : s.points }));
  const all = plotted.flatMap((s) => s.pts);
  if (!all.length) return <StateView empty={{ title: 'No recorded values.', body: 'These people have no dated estimates yet.' }} />;

  const allTimes = recordedTimes(plotted.map((s) => s.pts));
  // All = first to last recorded value; a range ends now, so recent windows can be empty (values are never filled in).
  const t1 = span === Infinity ? (allTimes.length > 1 ? allTimes[allTimes.length - 1] : allTimes[0] + 1) : Math.max(Date.now(), allTimes[allTimes.length - 1]);
  const t0 = span === Infinity ? allTimes[0] : t1 - span;
  const times = allTimes.filter((t) => t >= t0 && t <= t1);
  // Each line keeps one neighbour outside the window so it runs to the edge (clipped).
  const near = (pts: Point[]) => {
    const a = pts.findIndex((p) => p.t >= t0);
    const b = pts.findLastIndex((p) => p.t <= t1);
    if (a === -1 || b === -1) return a === -1 ? [] : pts.slice(Math.max(0, a - 1), a + 1); // window after/before all values
    return pts.slice(Math.max(0, a - 1), b + 2);
  };
  const shown = plotted.map((s) => ({ ...s, near: near(s.pts) }));
  const vs = (times.length ? shown.flatMap((s) => s.near) : all).map((p) => p.v);
  const lo = Math.min(...vs, mode === 'growth' ? 0 : Infinity);
  const hi = Math.max(...vs, mode === 'growth' ? 0 : -Infinity);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  // Direct labels at each line's end, nudged apart so they never collide.
  const ends = plotted
    .filter((s) => s.pts.length && s.pts[s.pts.length - 1].t >= t0 && s.pts[s.pts.length - 1].t <= t1)
    .map((s) => ({ s, y: y(s.pts[s.pts.length - 1].v) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 16);

  const snap = (px: number) => times.reduce((best, t) => (Math.abs(x(t) - px) < Math.abs(x(best) - px) ? t : best), times[0]);
  const onMove = (e: GestureResponderEvent) => {
    if (times.length) setCursor(snap(e.nativeEvent.locationX));
  };
  const at = cursor != null && cursor >= t0 && cursor <= t1 ? cursor : (times[times.length - 1] ?? allTimes[allTimes.length - 1]);
  const activePreset = presets.find((p) => p.span === span)?.label;

  return (
    <View style={{ gap: space.sm }}>
      <RangePicker active={activePreset} onPick={(p) => { setSpan(p); setCursor(null); }} />
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <Caption>{formatDate(new Date(at))}</Caption>
        {plotted.map((s) => {
          const v = valueAt(s.pts, at);
          return (
            <View key={s.person.id} style={styles.readoutItem}>
              <View style={[styles.legendLine, { backgroundColor: s.color }]} />
              <Text style={[type.number, { color: color.text, fontSize: 15 }]}>{v == null ? '—' : format(v)}</Text>
              <Caption>{s.person.name.split(' ').at(-1)}</Caption>
            </View>
          );
        })}
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onMove}
        onResponderMove={onMove}
        {...(Platform.OS === 'web' ? ({ onPointerMove: onMove, onPointerLeave: () => setCursor(null) } as object) : null)}
        accessible
        accessibilityLabel={`Comparison chart, ${mode === 'value' ? 'net worth' : 'change since first estimate'}. ${plotted
          .map((s) => `${s.person.name}: ${s.pts.map((p) => `${formatDate(new Date(p.t))} ${format(p.v)}`).join(', ')}`)
          .join('. ')}.`}
        style={{ height: H }}>
        {width > 0 && (
          <Svg width={width} height={H}>
            {[yMax - pad, yMin + pad].map((v) => (
              <Fragment key={v}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={color.hairline} strokeWidth={1} />
                {/* Axis values live in the left gutter; the right gutter belongs to the line labels. */}
                <SvgText x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fontFamily={font.regular} fill={color.textSecondary}>
                  {axis(v)}
                </SvgText>
              </Fragment>
            ))}
            <Defs>
              <ClipPath id="plot">
                <Rect x={PAD.left} y={0} width={plotW} height={H} />
              </ClipPath>
            </Defs>
            {cursor != null && cursor >= t0 && cursor <= t1 && <Line x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={H - PAD.bottom} stroke={color.textSecondary} strokeWidth={1} />}
            <G clipPath="url(#plot)">
            {shown.map((s) => (
              <Fragment key={s.person.id}>
                {s.near.length > 1 && (
                  <Path
                    d={s.near.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}
                    stroke={s.color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                  />
                )}
                {s.near.map((p) => (
                  <Circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} stroke={color.surface} strokeWidth={2} />
                ))}
              </Fragment>
            ))}
            </G>
            {!narrow && ends.map(({ s, y: ly }) => (
              <SvgText key={s.person.id} x={x(s.pts[s.pts.length - 1].t) + 8} y={ly + 4} fontSize={12} fontFamily={font.medium} fill={color.text}>
                {s.person.name.split(' ').at(-1)}
              </SvgText>
            ))}
            <SvgText x={PAD.left} y={H - 6} fontSize={11} fontFamily={font.regular} fill={color.textSecondary}>
              {formatDate(new Date(t0))}
            </SvgText>
            <SvgText x={width - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fontFamily={font.regular} fill={color.textSecondary}>
              {formatDate(new Date(t1))}
            </SvgText>
          </Svg>
        )}
        {!times.length && (
          <View style={styles.emptyOverlay} pointerEvents="box-none">
            <Text style={[type.headline, { color: color.text, textAlign: 'center' }]}>No recorded values in this window.</Text>
            <Pressable accessibilityRole="button" onPress={() => setSpan(Infinity)} style={styles.creditRow}>
              <Text style={[type.headline, { color: color.action }]}>Show all time</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { flexGrow: 1, flexBasis: 220, padding: space.md, gap: space.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  cardName: { ...type.headline, color: color.action },
  cardValue: { fontSize: 17, letterSpacing: -0.3, color: color.text },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  rowValue: { alignItems: 'flex-end', gap: 2 },
  // Same spot and ring as the rank badge on Rankings, in the selection blue.
  checkBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.surface,
    backgroundColor: color.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCard: { padding: space.md, gap: space.md },
  modes: { flexDirection: 'row', backgroundColor: color.fill, borderRadius: radius.pill, padding: 3, alignSelf: 'flex-start' },
  mode: { minHeight: minTouch - 8, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  modeOn: { backgroundColor: color.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  modeLabel: { fontFamily: font.semibold, fontSize: 13, color: color.textSecondary },
  emptyOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.lg },
  readout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  readoutItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  list: { overflow: 'hidden', paddingVertical: space.xs },
  row: { paddingHorizontal: space.md, paddingVertical: space.sm + 2, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: minTouch },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 40, gap: space.sm },
  tableHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  dateCol: { width: 110 },
  valueCol: { flex: 1, textAlign: 'right' },
});
