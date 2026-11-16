// World tab views beyond places: Money (where revenue comes from), Economies (that revenue against each country's
// GDP, and fortunes against whole economies) and What if (a hypothetical drop in one place). Every figure is
// reported revenue from SEC filings, World Bank GDP or a tracked net worth; the What if view only multiplies them.
import * as WebBrowser from 'expo-web-browser';
import { Chip as Tag, Slider } from 'heroui-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { GlobeArc, GlobeFill } from '@/components/globe';
import { Body, Caption, Heading, Icon, Portrait, Surface, icons, minTouch } from '@/components/ui';
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

// ——— What if ———

/** The slider's largest hypothetical fall, in percent. */
const MAX_DROP = 50;
export type WhatIfMode = 'place' | 'price';

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

/** Companies with at least one recorded, priced stake: what the share-price mode can move. */
export function priceTargets(empires: Empire[]) {
  const by = new Map<string, { key: string; label: string; value: number }>();
  for (const e of empires) {
    for (const s of e.stakes) {
      if (!s.value) continue;
      const t = by.get(s.company.id) ?? { key: s.company.id, label: s.company.name, value: 0 };
      t.value += s.value;
      by.set(s.company.id, t);
    }
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

type WealthHit = { empire: Empire; company: CompanyView; loss: number; stake: number };

function WealthRow({ h, first, assumption }: { h: WealthHit; first: boolean; assumption: string }) {
  const worth = h.empire.person.net_worth_usd;
  const share = worth ? h.loss / worth : null;
  return (
    <View
      style={[styles.row, !first && styles.sep]}
      accessible
      accessibilityLabel={`${h.empire.person.name}: down ${usd(h.loss)}${share != null ? `, ${pct(share)} of their fortune` : ''}, ${assumption}`}>
      <View style={styles.flex}>
        <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
          {h.empire.person.name}
        </Text>
        <Caption numberOfLines={1}>
          {h.company.name} stake {usd(h.stake)}
        </Caption>
      </View>
      <View style={styles.price}>
        <View style={styles.rowLine}>
          <Icon name={icons.down} size={16} tint={color.loss} />
          <Text style={[type.number, { color: color.loss, fontSize: 15 }]}>{usd(h.loss)}</Text>
        </View>
        {share != null && <Caption>{pct(share)} of their fortune</Caption>}
      </View>
    </View>
  );
}

export function WhatIfPanel({
  lines,
  empires,
  mode,
  target,
  company,
  drop,
  onMode,
  onTarget,
  onCompany,
  onDrop,
}: {
  lines: Line[];
  empires: Empire[];
  mode: WhatIfMode;
  target: string;
  company: string;
  drop: number;
  onMode: (m: WhatIfMode) => void;
  onTarget: (key: string) => void;
  onCompany: (id: string) => void;
  onDrop: (d: number) => void;
}) {
  const places = whatIfTargets(lines);
  const firms = priceTargets(empires);
  const hit = mode === 'place' ? lines.filter((l) => l.placeKey === target) : [];
  const revenueAtRisk = hit.reduce((n, l) => n + l.revenue * drop, 0);
  const label = mode === 'place' ? (places.find((t) => t.key === target)?.label ?? target) : (firms.find((t) => t.key === company)?.label ?? '');

  // Wealth: share price mode is exact (recorded shares × price × fall). Place mode assumes the share price falls by the
  // same share as the company's revenue lost there, and says so.
  const wealth: WealthHit[] = [];
  for (const e of empires) {
    for (const s of e.stakes) {
      if (!s.value) continue;
      if (mode === 'price' && s.company.id === company) wealth.push({ empire: e, company: s.company, loss: s.value * drop, stake: s.value });
      if (mode === 'place') {
        const l = hit.find((x) => x.company.id === s.company.id);
        if (l) wealth.push({ empire: e, company: s.company, loss: s.value * l.share * drop, stake: s.value });
      }
    }
  }
  wealth.sort((a, b) => b.loss - a.loss);
  const wealthTotal = wealth.reduce((n, w) => n + w.loss, 0);
  const assumption = mode === 'price' ? 'from recorded shares times the price fall' : 'if the share price fell by the same share as the revenue lost';
  const unrecorded = mode === 'place' ? [...new Set(hit.flatMap((l) => l.owners.filter((o) => !o.stakes.some((s) => s.company.id === l.company.id && s.value)).map((o) => o.person.name)))] : [];

  return (
    <Surface style={styles.card}>
      <View style={styles.rowLine}>
        <Heading level={2}>What if.</Heading>
        <View style={styles.hypo}>
          <Caption>Hypothetical</Caption>
        </View>
      </View>
      <View accessibilityRole="tablist" style={styles.segments}>
        {(['place', 'price'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => onMode(m)} style={[styles.segment, mode === m && styles.segmentOn]}>
            <Text style={[type.headline, { color: mode === m ? color.text : color.textSecondary }]}>{m === 'place' ? 'A place' : 'A share price'}</Text>
          </Pressable>
        ))}
      </View>
      <Body secondary>
        {mode === 'place'
          ? 'Pick a place and a fall in business there: whose companies lose revenue, and roughly what that could mean for their owners.'
          : 'Pick a company and a fall in its share price: exactly how much each owner’s recorded stake would lose.'}
      </Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityRole="tablist">
        {(mode === 'place' ? places : firms).map((t) => {
          const on = t.key === (mode === 'place' ? target : company);
          return (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => (mode === 'place' ? onTarget(t.key) : onCompany(t.key))} style={[styles.pill, on && styles.pillOn]}>
              <Text style={[type.headline, { fontSize: 15, color: on ? color.action : color.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.block}>
        <View style={styles.rowLine}>
          <Text style={[type.headline, styles.flex, { color: color.text }]}>{mode === 'place' ? 'Business falls by' : 'Share price falls by'}</Text>
          <Icon name={icons.down} size={16} tint={color.loss} />
          <Text style={[type.number, { color: color.loss, fontSize: 17 }]}>{Math.round(drop * 100)}%</Text>
        </View>
        <Slider
          value={Math.round(drop * 100)}
          minValue={1}
          maxValue={MAX_DROP}
          step={1}
          aria-label={mode === 'place' ? 'How far business falls, in percent' : 'How far the share price falls, in percent'}
          onChange={(v) => onDrop((Array.isArray(v) ? v[0] : v) / 100)}>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
      </View>

      {mode === 'place' && (
        <>
          <View style={styles.result} accessible accessibilityLabel={`If business in ${label} fell ${drop * 100} percent, ${usd(revenueAtRisk)} of yearly revenue would be at risk`}>
            <Icon name={icons.down} size={22} tint={color.loss} />
            <Text style={[type.title, { color: color.loss, fontVariant: ['tabular-nums'] }]}>{usd(revenueAtRisk)}</Text>
            <Caption style={styles.flex}>
              of yearly revenue at risk if business in {label} fell {drop * 100}%
            </Caption>
          </View>
          <View style={styles.list}>
            {hit.map((l, i) => (
              <View key={l.key} style={[styles.row, i > 0 && styles.sep]} accessible accessibilityLabel={`${l.company.name}: down ${usd(l.revenue * drop)}, ${pct(l.share * drop)} of its revenue`}>
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
        </>
      )}

      <Heading level={2}>{mode === 'place' ? 'Owners’ wealth.' : `${label} owners.`}</Heading>
      {wealth.length ? (
        <>
          <View style={styles.result} accessible accessibilityLabel={`${usd(wealthTotal)} off these fortunes, ${assumption}`}>
            <Icon name={icons.down} size={22} tint={color.loss} />
            <Text style={[type.title, { color: color.loss, fontVariant: ['tabular-nums'] }]}>{usd(wealthTotal)}</Text>
            <Caption style={styles.flex}>off these fortunes, {assumption}</Caption>
          </View>
          <View style={styles.list}>
            {wealth.map((h, i) => (
              <WealthRow key={`${h.empire.person.id}:${h.company.id}`} h={h} first={i === 0} assumption={assumption} />
            ))}
          </View>
        </>
      ) : (
        <Caption>No recorded share counts for these owners yet.</Caption>
      )}
      {unrecorded.length > 0 && <Caption>No recorded share count, so not included: {unrecorded.join(', ')}.</Caption>}
      <Caption>
        {mode === 'place'
          ? 'Revenue from annual reports; stakes are recorded shares (SEC Form 4 or Schedule 13G/13D) at the latest price. Share prices don’t move one-for-one with revenue: the wealth figure is a rough scale, not a forecast. Profits, supply chains and other assets aren’t modelled.'
          : 'Stakes are recorded shares (SEC Form 4 or Schedule 13G/13D) at the latest price. Other assets and companies aren’t moved.'}
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
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bigLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  big: { ...type.title, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: color.text, fontVariant: ['tabular-nums'] },
  rowOn: { backgroundColor: color.fill },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  more: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: space.lg },
});
