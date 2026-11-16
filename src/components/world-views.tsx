// World tab views beyond places: Money (where revenue comes from) and Economies (that revenue against each country's
// GDP, and fortunes against whole economies). Every figure is reported revenue from SEC filings, World Bank GDP or a
// tracked net worth. What if (simulations) lives in world-sim.tsx.
import * as WebBrowser from 'expo-web-browser';
import { Chip as Tag } from 'heroui-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GlobeArc, GlobeFill } from '@/components/globe';
import { Body, Caption, Heading, Portrait, Surface, minTouch } from '@/components/ui';
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

export type EconomyMode = 'fortune' | 'revenue';

/** Where one fortune falls among countries' yearly GDP (largest first). */
export function fortuneRank(worth: number, countries: Country[]) {
  const gdps = countries.filter((c) => c.gdp_usd).sort((a, b) => b.gdp_usd! - a.gdp_usd!);
  const smaller = gdps.filter((c) => c.gdp_usd! < worth);
  return { gdps, smaller, below: smaller[0] ?? null, above: gdps.filter((c) => c.gdp_usd! >= worth).at(-1) ?? null };
}

/** The person the fortune comparison is about: the one picked, else the richest recorded. */
export function fortuneSubject(empires: Empire[], focus: Empire | null) {
  if (focus?.person.net_worth_usd) return focus;
  return empires.reduce<Empire | null>((best, e) => ((e.person.net_worth_usd ?? 0) > (best?.person.net_worth_usd ?? 0) ? e : best), null);
}

/** Globe shading for the fortune comparison: every country whose yearly GDP is smaller than the fortune. */
export function fortuneFills(empires: Empire[], countries: Country[], focus: Empire | null): GlobeFill[] {
  const worth = fortuneSubject(empires, focus)?.person.net_worth_usd;
  return worth ? fortuneRank(worth, countries).smaller.map((c) => ({ iso2: c.iso2, strength: 0.85 })) : [];
}

const SHOWN = 5;
const TAGS = 4;

export function EconomiesPanel({
  lines,
  countries,
  empires,
  focus,
  mode,
  onMode,
  onSelect,
}: {
  lines: Line[];
  countries: Country[];
  empires: Empire[];
  focus: Empire | null;
  mode: EconomyMode;
  onMode: (m: EconomyMode) => void;
  onSelect: (personId: string) => void;
}) {
  return (
    <Surface style={styles.card}>
      <Heading level={2}>Economies.</Heading>
      <View accessibilityRole="tablist" style={styles.segments}>
        {(['fortune', 'revenue'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => onMode(m)} style={[styles.segment, mode === m && styles.segmentOn]}>
            <Text style={[type.headline, { color: mode === m ? color.text : color.textSecondary }]}>{m === 'fortune' ? 'A fortune' : 'Revenue'}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'fortune' ? <FortuneView countries={countries} empires={empires} focus={focus} onSelect={onSelect} /> : <RevenueView lines={lines} countries={countries} focus={focus} />}
    </Surface>
  );
}

function FortuneView({ countries, empires, focus, onSelect }: { countries: Country[]; empires: Empire[]; focus: Empire | null; onSelect: (personId: string) => void }) {
  const subject = fortuneSubject(empires, focus);
  const worth = subject?.person.net_worth_usd;
  if (!subject || !worth) return <Caption>No recorded net worth to compare yet.</Caption>;
  const { gdps, smaller, below, above } = fortuneRank(worth, countries);
  const others = empires
    .filter((e) => e.person.net_worth_usd)
    .sort((a, b) => b.person.net_worth_usd! - a.person.net_worth_usd!)
    .slice(0, SHOWN);
  return (
    <>
      <View style={styles.hero} accessible accessibilityLabel={`${subject.person.name}, ${usd(worth)}: larger than the yearly GDP of ${smaller.length} of ${gdps.length} countries`}>
        <Portrait uri={subject.person.portrait_url} name={subject.person.name} size={56} rounded={16} />
        <View style={styles.flex}>
          <Text style={[type.headline, { color: color.text }]} numberOfLines={2}>
            {subject.person.name}
          </Text>
          <Caption>{usd(worth)} recorded net worth</Caption>
        </View>
      </View>
      <View style={styles.block}>
        <View style={styles.bigLine}>
          <Text style={styles.big}>{smaller.length}</Text>
          <Text style={[type.headline, styles.flex, { color: color.text }]}>of {gdps.length} countries have a smaller yearly GDP.</Text>
        </View>
        <Bar value={gdps.length ? smaller.length / gdps.length : 0} />
        <Body secondary>
          {below && above
            ? `Between ${below.name} (${usd(below.gdp_usd!)}) and ${above.name} (${usd(above.gdp_usd!)}).`
            : below
              ? 'Larger than every country’s yearly GDP.'
              : 'Smaller than every country’s yearly GDP.'}{' '}
          The lit countries on the globe are the smaller ones.
        </Body>
      </View>

      <Heading level={2}>Fortunes and countries.</Heading>
      <View style={styles.list}>
        {others.map((e, i) => {
          const n = fortuneRank(e.person.net_worth_usd!, countries).smaller.length;
          const on = e.person.id === subject.person.id;
          return (
            <Pressable
              key={e.person.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${e.person.name}: larger than ${n} of ${gdps.length} countries' GDP`}
              onPress={() => onSelect(e.person.id)}
              style={[styles.row, i > 0 && styles.sep, on && styles.rowOn]}>
              <Portrait uri={e.person.portrait_url} name={e.person.name} size={32} />
              <View style={[styles.flex, styles.block]}>
                <View style={styles.rowLine}>
                  <Text style={[type.headline, styles.flex, { color: color.text }]} numberOfLines={1}>
                    {e.person.name}
                  </Text>
                  <Text style={[type.number, { color: color.text, fontSize: 15 }]}>{n}</Text>
                </View>
                <Bar value={gdps.length ? n / gdps.length : 0} />
              </View>
            </Pressable>
          );
        })}
      </View>
      <Caption>A fortune is wealth built up over years; GDP is what a country produces in one year. The comparison is for scale.</Caption>
      <SourceLink label={`GDP from the World Bank, ${gdps[0]?.gdp_year ?? ''}`} url="https://data.worldbank.org/indicator/NY.GDP.MKTP.CD" />
    </>
  );
}

function RevenueView({ lines, countries, focus }: { lines: Line[]; countries: Country[]; focus: Empire | null }) {
  const { rows } = economyFills(lines, countries, focus);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <>
      <Body secondary>
        Countries shaded by what {focus ? `${focus.person.name}'s companies` : 'the tracked companies'} earn there, set against that country’s GDP. Revenue
        isn’t a share of the economy; it’s a sense of scale.
      </Body>
      {rows.length ? (
        <View style={styles.list}>
          {shown.map((r, i) => (
            <View key={r.iso2} style={[styles.block, styles.rowPad, i > 0 && styles.sep]} accessible accessibilityLabel={`${r.name}: ${usd(r.revenue)} earned, equal to ${pct(r.ratio, 2)} of its GDP`}>
              <View style={styles.rowLine}>
                <Text style={[type.headline, styles.flex, { color: color.text }]}>{r.name}</Text>
                <Text style={[type.number, { color: color.text, fontSize: 15 }]}>{pct(r.ratio, 2)} of GDP</Text>
              </View>
              <Bar value={r.ratio / rows[0].ratio} />
              <Caption>
                {usd(r.revenue)} earned · GDP {usd(r.gdp)} ({r.gdpYear})
              </Caption>
              <View style={styles.tags}>
                {r.parts.slice(0, TAGS).map((p) => (
                  <Tag key={p.key} size="sm" variant="soft" color="default">
                    <Tag.Label>
                      {p.company.name} {usd(p.revenue)}
                    </Tag.Label>
                  </Tag>
                ))}
                {r.parts.length > TAGS && <Caption>+{r.parts.length - TAGS} more</Caption>}
              </View>
            </View>
          ))}
          {rows.length > SHOWN && (
            <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={[styles.more, styles.sep]}>
              <Text style={[type.headline, { color: color.action }]}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Caption>No company reports revenue for a single country yet.</Caption>
      )}
      <SourceLink label="Revenue from SEC annual reports; GDP from the World Bank" url="https://data.worldbank.org/indicator/NY.GDP.MKTP.CD" />
    </>
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
  segments: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: radius.pill, backgroundColor: color.fill },
  segment: { minHeight: 38, minWidth: 72, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.md, borderRadius: radius.pill },
  segmentOn: { backgroundColor: color.surface },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bigLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  big: { ...type.title, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: color.text, fontVariant: ['tabular-nums'] },
  rowOn: { backgroundColor: color.fill },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  more: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: space.lg },
});
