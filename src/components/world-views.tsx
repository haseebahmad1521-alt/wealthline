// World tab views beyond places: Money (where revenue comes from), Economies (that revenue against each country's
// GDP, and fortunes against whole economies) and What if (a hypothetical drop in one place). Every figure is
// reported revenue from SEC filings, World Bank GDP or a tracked net worth; the What if view only multiplies them.
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GlobeArc, GlobeFill } from '@/components/globe';
import { Body, Caption, Heading, Icon, Surface, icons, minTouch } from '@/components/ui';
import { usd } from '@/lib/format';
import { lineAnchor, type LatLng } from '@/lib/geo';
import type { CompanyView, Country, Empire } from '@/lib/world';
import { color, radius, space, type } from '@/theme';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const placeName = (region: string, country: string | null) => (country && /^[A-Z]{2}$/.test(country) ? (regionName.of(country) ?? region) : region);
const open = (url: string | null) => url && void WebBrowser.openBrowserAsync(url);
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

/** One reported revenue line, tied to its company, owners and (when it has one) a place on the globe. */
export type Line = {
  key: string;
  company: CompanyView;
  owners: Empire[];
  place: string; // "Taiwan", "EMEA"
  placeKey: string; // ISO2 or region text
  country: string | null;
  revenue: number;
  share: number;
  fiscalYear: number;
  anchor: LatLng | null;
  hq: LatLng | null;
};

/** Every company's latest reported revenue lines, each company once even when several people share it. */
export function revenueLines(empires: Empire[]): Line[] {
  const owners = new Map<string, Empire[]>();
  for (const e of empires) for (const c of e.companies) owners.set(c.id, [...(owners.get(c.id) ?? []), e]);
  const out: Line[] = [];
  const seen = new Set<string>();
  for (const e of empires) {
    for (const c of e.companies) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      for (const r of c.regions) {
        out.push({
          key: `${c.id}:${r.region}`,
          company: c,
          owners: owners.get(c.id) ?? [],
          place: placeName(r.region, r.country),
          placeKey: r.country ?? r.region,
          country: r.country,
          revenue: r.revenue_usd,
          share: r.share,
          fiscalYear: r.fiscal_year,
          anchor: lineAnchor(r.region, r.country),
          hq: c.hq_lat != null && c.hq_lng != null ? { lat: c.hq_lat, lng: c.hq_lng } : null,
        });
      }
    }
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}

/** Flow lines for the globe; when someone is focused, only their companies, coloured as theirs. */
export function flowArcs(lines: Line[], focus: Empire | null, only?: (l: Line) => boolean, risk = false): GlobeArc[] {
  const shown = lines.filter((l) => l.anchor && l.hq && (!focus || l.owners.some((o) => o.person.id === focus.person.id)) && (!only || only(l)));
  const max = Math.max(1, ...shown.map((l) => l.revenue));
  return shown.map((l) => ({
    key: l.key,
    from: l.anchor!,
    to: l.hq!,
    weight: l.revenue / max,
    group: focus && l.owners.some((o) => o.person.id === focus.person.id) ? focus.person.id : (l.owners[0]?.person.id ?? ''),
    risk,
  }));
}

function SourceLink({ label, url }: { label: string; url: string | null }) {
  return url ? (
    <Pressable accessibilityRole="link" onPress={() => open(url)} style={styles.source}>
      <Caption style={{ color: color.action }}>{label}</Caption>
    </Pressable>
  ) : (
    <Caption>{label}</Caption>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.bar, { width: `${Math.max(Math.min(value, 1) * 100, 2)}%` }]} />
    </View>
  );
}

// ——— Money ———

export function MoneyPanel({ lines, focus }: { lines: Line[]; focus: Empire | null }) {
  const mine = lines.filter((l) => !focus || l.owners.some((o) => o.person.id === focus.person.id));
  const placed = mine.filter((l) => l.anchor);
  const total = mine.reduce((n, l) => n + l.revenue, 0);
  const companies = new Set(mine.map((l) => l.company.id)).size;
  if (!mine.length) {
    return (
      <Surface style={styles.card}>
        <Heading level={2}>Money.</Heading>
        <Body secondary>{focus ? `None of ${focus.person.name}'s companies report revenue by place yet.` : 'No revenue by place is recorded yet.'}</Body>
      </Surface>
    );
  }
  return (
    <Surface style={styles.card}>
      <Heading level={2}>Money.</Heading>
      <Text style={[type.title, styles.figure]}>{usd(total)} a year</Text>
      <Body secondary>
        Revenue {focus ? `${focus.person.name}'s` : 'the tracked'} {companies === 1 ? 'company reports' : `${companies} companies report`} by place, from
        their latest annual reports. Lines run from where the money is earned to headquarters, thicker for more.
        {placed.length < mine.length ? ' “Rest of world” lines have no single place, so they are listed but not drawn.' : ''}
      </Body>
      <View style={styles.list}>
        {mine.slice(0, 14).map((l, i) => (
          <View key={l.key} style={[styles.row, i > 0 && styles.sep]} accessible accessibilityLabel={`${l.company.name} earns ${usd(l.revenue)} in ${l.place}, ${pct(l.share, 0)} of its revenue`}>
            <View style={styles.flex}>
              <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                {l.place}
              </Text>
              <Caption numberOfLines={1}>
                {l.company.name} · {pct(l.share, 0)} of its revenue{l.anchor ? '' : ' · not drawn'}
              </Caption>
            </View>
            <Text style={[type.number, { color: color.text, fontSize: 15 }]}>{usd(l.revenue)}</Text>
          </View>
        ))}
      </View>
      <SourceLink label={`SEC annual reports (Form 10-K), fiscal ${Math.max(...mine.map((l) => l.fiscalYear))}`} url={mine[0].company.regions[0]?.source_url ?? null} />
    </Surface>
  );
}

// ——— Economies ———

export function economyFills(lines: Line[], countries: Country[], focus: Empire | null) {
  const gdp = new Map(countries.map((c) => [c.iso2, c]));
  const byCountry = new Map<string, { iso2: string; name: string; revenue: number; gdp: number; gdpYear: number | null; parts: Line[] }>();
  for (const l of lines) {
    if (!l.country || (focus && !l.owners.some((o) => o.person.id === focus.person.id))) continue;
    const c = gdp.get(l.country);
    if (!c?.gdp_usd) continue;
    const row = byCountry.get(l.country) ?? { iso2: l.country, name: c.name, revenue: 0, gdp: c.gdp_usd, gdpYear: c.gdp_year, parts: [] };
    row.revenue += l.revenue;
    row.parts.push(l);
    byCountry.set(l.country, row);
  }
  const rows = [...byCountry.values()].map((r) => ({ ...r, ratio: r.revenue / r.gdp })).sort((a, b) => b.ratio - a.ratio);
  const max = Math.max(...rows.map((r) => r.ratio), 1e-9);
  const fills: GlobeFill[] = rows.map((r) => ({ iso2: r.iso2, strength: r.ratio / max }));
  return { rows, fills };
}

export function EconomiesPanel({ lines, countries, empires, focus }: { lines: Line[]; countries: Country[]; empires: Empire[]; focus: Empire | null }) {
  const { rows } = economyFills(lines, countries, focus);
  const gdps = countries.filter((c) => c.gdp_usd).sort((a, b) => b.gdp_usd! - a.gdp_usd!);
  const people = (focus ? [focus] : empires.slice(0, 5)).filter((e) => e.person.net_worth_usd);
  return (
    <Surface style={styles.card}>
      <Heading level={2}>Economies.</Heading>
      <Body secondary>
        Countries shaded by what {focus ? `${focus.person.name}'s companies` : 'the tracked companies'} earn there, set against that country’s GDP. Revenue
        isn’t a share of the economy; it’s a sense of scale.
      </Body>
      {rows.length ? (
        <View style={styles.list}>
          {rows.map((r, i) => (
            <View key={r.iso2} style={[styles.block, styles.rowPad, i > 0 && styles.sep]} accessible accessibilityLabel={`${r.name}: ${usd(r.revenue)} earned, equal to ${pct(r.ratio, 2)} of its GDP`}>
              <View style={styles.rowLine}>
                <Text style={[type.headline, styles.flex, { color: color.text }]}>{r.name}</Text>
                <Text style={[type.number, { color: color.text, fontSize: 15 }]}>{pct(r.ratio, 2)} of GDP</Text>
              </View>
              <Bar value={r.ratio / rows[0].ratio} />
              <Caption>
                {usd(r.revenue)} earned · GDP {usd(r.gdp)} ({r.gdpYear}) · {r.parts.map((p) => `${p.company.name} ${usd(p.revenue)}`).join(', ')}
              </Caption>
            </View>
          ))}
        </View>
      ) : (
        <Caption>No company reports revenue for a single country yet.</Caption>
      )}

      <Heading level={2}>Fortunes and countries.</Heading>
      {people.map((e) => {
        const worth = e.person.net_worth_usd!;
        const smaller = gdps.filter((c) => c.gdp_usd! < worth);
        const above = gdps.filter((c) => c.gdp_usd! >= worth).at(-1);
        const below = smaller[0];
        return (
          <View key={e.person.id} style={styles.block} accessible>
            <Text style={[type.headline, { color: color.text }]}>
              {e.person.name}: {usd(worth)}
            </Text>
            <Body secondary>
              Larger than the yearly GDP of {smaller.length} of {gdps.length} countries
              {above && below ? `, between ${below.name} (${usd(below.gdp_usd!)}) and ${above.name} (${usd(above.gdp_usd!)})` : ''}. A fortune is wealth
              built up over years; GDP is what a country produces in one year.
            </Body>
          </View>
        );
      })}
      <SourceLink label={`GDP from the World Bank, ${gdps[0]?.gdp_year ?? ''}`} url="https://data.worldbank.org/indicator/NY.GDP.MKTP.CD" />
    </Surface>
  );
}

// ——— What if ———

export const DROPS = [0.1, 0.25, 0.5] as const;

export function whatIfTargets(lines: Line[]) {
  const by = new Map<string, { key: string; label: string; revenue: number }>();
  for (const l of lines) {
    if (!l.anchor) continue;
    const t = by.get(l.placeKey) ?? { key: l.placeKey, label: l.place, revenue: 0 };
    t.revenue += l.revenue;
    by.set(l.placeKey, t);
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

export function WhatIfPanel({
  lines,
  target,
  drop,
  onTarget,
  onDrop,
}: {
  lines: Line[];
  target: string;
  drop: number;
  onTarget: (key: string) => void;
  onDrop: (d: number) => void;
}) {
  const targets = whatIfTargets(lines);
  const hit = lines.filter((l) => l.placeKey === target);
  const total = hit.reduce((n, l) => n + l.revenue * drop, 0);
  const label = targets.find((t) => t.key === target)?.label ?? target;
  return (
    <Surface style={styles.card}>
      <View style={styles.rowLine}>
        <Heading level={2}>What if.</Heading>
        <View style={styles.hypo}>
          <Caption>Hypothetical</Caption>
        </View>
      </View>
      <Body secondary>Pick a place and a fall in business there. The globe and the list show whose companies would lose revenue, using what each company reports earning there.</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityRole="tablist">
        {targets.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: t.key === target }} onPress={() => onTarget(t.key)} style={[styles.pill, t.key === target && styles.pillOn]}>
            <Text style={[type.headline, { fontSize: 15, color: t.key === target ? color.action : color.text }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View accessibilityRole="tablist" style={styles.segments}>
        {DROPS.map((d) => (
          <Pressable key={d} accessibilityRole="tab" accessibilityLabel={`Business falls ${d * 100} percent`} accessibilityState={{ selected: d === drop }} onPress={() => onDrop(d)} style={[styles.segment, d === drop && styles.segmentOn]}>
            <Text style={[type.headline, { color: d === drop ? color.text : color.textSecondary }]}>−{d * 100}%</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.result} accessible accessibilityLabel={`If business in ${label} fell ${drop * 100} percent, ${usd(total)} of yearly revenue would be at risk across ${hit.length} companies`}>
        <Icon name={icons.down} size={22} tint={color.loss} />
        <Text style={[type.title, { color: color.loss, fontVariant: ['tabular-nums'] }]}>{usd(total)}</Text>
        <Caption style={styles.flex}>
          of yearly revenue at risk if business in {label} fell {drop * 100}%
        </Caption>
      </View>
      <View style={styles.list}>
        {hit.map((l, i) => (
          <View key={l.key} style={[styles.row, i > 0 && styles.sep]} accessible accessibilityLabel={`${l.company.name}, owned by ${l.owners.map((o) => o.person.name).join(' and ')}: down ${usd(l.revenue * drop)}, ${pct(l.share * drop)} of its revenue`}>
            <View style={styles.flex}>
              <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                {l.company.name}
              </Text>
              <Caption numberOfLines={1}>{l.owners.map((o) => o.person.name).join(', ')}</Caption>
            </View>
            <View style={styles.price}>
              <View style={styles.rowLine}>
                <Icon name={icons.down} size={16} tint={color.loss} />
                <Text style={[type.number, { color: color.loss, fontSize: 15 }]}>{usd(l.revenue * drop)}</Text>
              </View>
              <Caption>{pct(l.share * drop)} of its revenue</Caption>
            </View>
          </View>
        ))}
      </View>
      <Caption>
        Revenue only. Not modelled: share prices, profits, supply chains, or the owners’ wealth (their share counts aren’t recorded yet). Companies that report this place
        inside a wider region aren’t counted.
      </Caption>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md },
  figure: { color: color.text, fontVariant: ['tabular-nums'] },
  flex: { flex: 1, minWidth: 0 },
  list: { marginHorizontal: -space.lg },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  rowPad: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  block: { gap: space.xs },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: color.fill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.text },
  source: { alignSelf: 'flex-start', minHeight: minTouch, justifyContent: 'center' },
  hypo: { backgroundColor: color.fill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  pills: { gap: space.sm },
  pill: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.fill },
  pillOn: { backgroundColor: color.actionTint },
  segments: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: radius.pill, backgroundColor: color.fill },
  segment: { minHeight: 38, minWidth: 72, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.md, borderRadius: radius.pill },
  segmentOn: { backgroundColor: color.surface },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  price: { alignItems: 'flex-end', gap: 2 },
});
