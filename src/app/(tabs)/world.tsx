import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Chip as Tag } from 'heroui-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { MEDAL } from '@/components/arena';
import { Globe, type GlobeArc, type GlobeFill, type GlobeMarker, type GlobeSite } from '@/components/globe';
import { WorldGlobe } from '@/components/world-globe';
import { DROPS, EconomiesPanel, MoneyPanel, WhatIfPanel, economyFills, flowArcs, priceTargets, revenueLines, whatIfTargets, type WhatIfMode } from '@/components/world-views';
import { countryShape } from '@/lib/geo';
import { Body, Caption, Change, Heading, Portrait, Screen, StateView, Surface, minTouch } from '@/components/ui';
import { formatDate, formatTime, usd } from '@/lib/format';
import { scene } from '@/lib/scene';
import { LIVE_QUOTE_MS, useWorld, type CompanyView, type Empire, type Quote, type SiteKind, type Stake } from '@/lib/world';
import { color, desktopBreakpoint, radius, space, type } from '@/theme';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const country = (iso: string | null) => (iso ? (regionName.of(iso) ?? iso) : null);

const KIND: Record<SiteKind, [string, string]> = {
  hq: ['Headquarters', 'Headquarters'],
  factory: ['Factory', 'Factories'],
  launch_site: ['Launch site', 'Launch sites'],
  data_center: ['Data centre', 'Data centres'],
  research: ['Research site', 'Research sites'],
  office: ['Office', 'Offices'],
  store: ['Store', 'Stores'],
  other: ['Site', 'Sites'],
};

const VIEWS = [
  { key: 'places', label: 'Places' },
  { key: 'money', label: 'Money' },
  { key: 'economies', label: 'Economies' },
  { key: 'whatif', label: 'What if' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const formatShares = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString('en-US'));

const isLive = (q: Quote | null) => !!q && Date.now() - Date.parse(q.as_of) < LIVE_QUOTE_MS;
const open = (url: string | null) => url && void WebBrowser.openBrowserAsync(url);

export default function World() {
  const world = useWorld();
  const { width, height: windowHeight } = useWindowDimensions();
  const desktop = width >= desktopBreakpoint;
  const { focus: slug, view: viewParam } = useLocalSearchParams<{ focus?: string; view?: string }>();
  const view: ViewKey = VIEWS.some((v) => v.key === viewParam) ? (viewParam as ViewKey) : 'places';
  const empires = world.data ?? [];
  const focused = empires.find((e) => e.person.slug === slug) ?? null;
  const lines = useMemo(() => revenueLines(world.data ?? []), [world.data]);
  const targets = useMemo(() => whatIfTargets(lines), [lines]);
  const [target, setTarget] = useState<string | null>(null);
  const [drop, setDrop] = useState<number>(DROPS[1]);
  const [mode, setMode] = useState<WhatIfMode>('place');
  const [firm, setFirm] = useState<string | null>(null);
  // Default shock: the biggest market outside the United States; default company: the largest recorded stakes.
  const shock = target ?? targets.find((t) => t.key !== 'US')?.key ?? targets[0]?.key ?? '';
  const firms = useMemo(() => priceTargets(world.data ?? []), [world.data]);
  const company = firm ?? firms[0]?.key ?? '';

  let arcs: GlobeArc[] = [];
  let fills: GlobeFill[] = [];
  if (view === 'money') arcs = flowArcs(lines, focused);
  if (view === 'economies') fills = economyFills(lines, world.countries ?? [], focused).fills;
  if (view === 'whatif' && mode === 'place') {
    arcs = flowArcs(lines, null, (l) => l.placeKey === shock, true);
    if (countryShape(shock)) fills = [{ iso2: shock, strength: 1, risk: true }];
  }
  if (view === 'whatif' && mode === 'price') arcs = flowArcs(lines, null, (l) => l.company.id === company, true);
  const shockCentre = view === 'whatif' ? (arcs[0]?.from ?? null) : null;

  const { sites, markers } = useMemo(() => {
    const s: GlobeSite[] = [];
    const m: GlobeMarker[] = [];
    for (const e of world.data ?? []) {
      for (const c of e.companies) {
        const live = isLive(c.quote);
        // Keyed by person too: a company shared by several people (Alphabet, Walmart) is drawn once per empire, and
        // duplicate keys left stale rings frozen at old positions as the globe turned.
        for (const site of c.sites) s.push({ key: `${e.person.id}:${c.id}:${site.kind}:${site.name}`, lat: site.lat, lng: site.lng, kind: site.kind, group: e.person.id, live });
      }
      if (e.hq) m.push({ key: e.person.id, lat: e.hq.lat, lng: e.hq.lng, uri: e.person.portrait_url, label: e.person.name });
    }
    return { sites: s, markers: m };
  }, [world.data]);

  const select = (personId: string | null) => {
    const e = empires.find((x) => x.person.id === personId);
    router.setParams({ focus: e && e.person.slug !== slug ? e.person.slug : undefined });
  };

  const globeSize = desktop ? 520 : Math.min(width - space.md * 2 - space.md * 2, 440);
  // Web, Places: the real planet is the globe. While World is open the planet turns to face us (one scene, no page
  // change); leaving World swings it back to the orbit view.
  const planet = Platform.OS === 'web' && view === 'places';
  useFocusEffect(
    useCallback(() => {
      if (!planet) return;
      scene.preset = 'world';
      scene.invalidate?.();
      return () => {
        scene.preset = 'orbit';
        scene.invalidate?.();
      };
    }, [planet]),
  );
  const places = new Set(sites.map((s) => s.key.split(':').slice(1).join(':'))).size;

  return (
    <Screen>
      <View>
        <Heading>World.</Heading>
        <Body secondary>Where the biggest fortunes reach: every ring is a real place their companies own or run.</Body>
      </View>
      {world.isPending || world.error ? (
        <StateView loading={world.isPending} error={world.error} onRetry={() => void world.refetch()} />
      ) : !empires.length ? (
        <StateView empty={{ title: 'No company places yet.', body: 'Places appear once company records are linked to their sources.' }} />
      ) : (
        <>
          <View accessibilityRole="tablist" style={styles.segments}>
            {VIEWS.map((v) => (
              <Pressable
                key={v.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === v.key }}
                onPress={() => router.setParams({ view: v.key === 'places' ? undefined : v.key })}
                style={[styles.segment, view === v.key && styles.segmentOn]}>
                <Text numberOfLines={1} style={[type.headline, { fontSize: width < 360 ? 12.5 : 14, color: view === v.key ? color.text : color.textSecondary }]}>
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
            <Chip label="Everyone" selected={!focused} onPress={() => select(null)} />
            {empires.map((e) => (
              <Chip key={e.person.id} label={e.person.name} selected={focused?.person.id === e.person.id} onPress={() => select(e.person.id)} empire={e} />
            ))}
          </ScrollView>
          <View style={[styles.layout, desktop && styles.layoutWide]}>
            {planet ? (
              <View style={[styles.planetArea, desktop && styles.globeCardWide]}>
                <WorldGlobe
                  // Desktop: as tall as fits below the header, segments and chips (~360px), so the whole globe is in view.
                  height={desktop ? Math.max(360, Math.min(560, windowHeight - 360)) : Math.min(width - space.md * 2, 420)}
                  sites={sites}
                  markers={markers}
                  focus={focused?.person.id ?? null}
                  center={focused?.hq ?? null}
                  onSelect={(id) => select(id)}
                  onOpen={(id) => {
                    const e = empires.find((x) => x.person.id === id);
                    if (e) router.push(`/person/${e.person.slug}`);
                  }}
                  label={
                    focused
                      ? `Globe turned to ${focused.person.name}'s companies: ${focused.companies.reduce((n, c) => n + c.sites.length, 0)} places. Details follow.`
                      : `Globe of ${places} company places for ${empires.length} people. Details follow.`
                  }
                />
                <Caption style={styles.globeNote}>
                  Drag to turn; pinch or use + and − to zoom. Portraits join into one bubble when they crowd: tap it to fan them out, and tap a portrait for the profile. Dots are real company places from Wikidata; green ones moved in the last 30 minutes.
                </Caption>
              </View>
            ) : (
            <Surface style={[styles.globeCard, desktop && styles.globeCardWide]}>
              <Globe
                size={globeSize}
                sites={view === 'places' ? sites : []}
                markers={markers}
                arcs={arcs}
                fills={fills}
                focus={view === 'whatif' ? null : (focused?.person.id ?? null)}
                center={shockCentre ?? focused?.hq ?? null}
                onSelect={(id) => select(id)}
                label={
                  focused
                    ? `Globe turned to ${focused.person.name}'s companies: ${focused.companies.reduce((n, c) => n + c.sites.length, 0)} places. Details follow.`
                    : `Globe of ${places} company places for ${empires.length} people. Details follow.`
                }
              />
              <Caption style={styles.globeNote}>
                {view === 'places'
                  ? 'Drag to turn. Places from Wikidata; brighter, quicker rings mean the company’s share price moved in the last 30 minutes.'
                  : view === 'money'
                    ? 'Drag to turn. Lines carry reported revenue from where it’s earned to headquarters; thicker means more.'
                    : view === 'economies'
                      ? 'Drag to turn. Darker countries: more of the tracked companies’ revenue compared with that country’s GDP.'
                      : 'Drag to turn. Hypothetical: the place in red and the revenue that flows from it.'}
              </Caption>
            </Surface>
            )}
            <View style={[styles.panel, desktop && styles.panelWide]}>
              {view === 'money' ? (
                <MoneyPanel lines={lines} focus={focused} />
              ) : view === 'economies' ? (
                <EconomiesPanel lines={lines} countries={world.countries ?? []} empires={empires} focus={focused} />
              ) : view === 'whatif' ? (
                <WhatIfPanel
                  lines={lines}
                  empires={empires}
                  mode={mode}
                  target={shock}
                  company={company}
                  drop={drop}
                  onMode={setMode}
                  onTarget={setTarget}
                  onCompany={setFirm}
                  onDrop={setDrop}
                />
              ) : focused ? (
                <EmpirePanel empire={focused} />
              ) : (
                <Overview empires={empires} places={places} onSelect={select} />
              )}
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

function mainQuote(e: Empire) {
  return e.companies.find((c) => c.quote?.prev_close)?.quote ?? null;
}

function Chip({ label, selected, onPress, empire }: { label: string; selected: boolean; onPress: () => void; empire?: Empire }) {
  const q = empire ? mainQuote(empire) : null;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
      {empire && <Portrait uri={empire.person.portrait_url} name={empire.person.name} size={26} />}
      <Text style={[type.headline, { color: selected ? color.action : color.text, fontSize: 15 }]}>{label}</Text>
      {q?.prev_close ? <Change delta={q.price - q.prev_close} base={q.prev_close} size={13} compact /> : null}
    </Pressable>
  );
}

/** Everyone: an empire leaderboard by reported revenue, then by places; medals for the top three. */
function Overview({ empires, places, onSelect }: { empires: Empire[]; places: number; onSelect: (id: string) => void }) {
  const countries = new Set(empires.flatMap((e) => e.companies.flatMap((c) => c.sites.map((s) => s.country).filter(Boolean)))).size;
  const board = empires
    .map((e) => ({
      e,
      revenue: e.companies.reduce((n, c) => n + c.regions.reduce((m, r) => m + r.revenue_usd, 0), 0),
      places: e.companies.reduce((n, c) => n + c.sites.length, 0),
      countries: new Set(e.companies.flatMap((c) => c.sites.map((s) => s.country).filter(Boolean))).size,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.places - a.places);
  return (
    <Surface style={styles.panelCard}>
      <Heading level={2}>Empires.</Heading>
      <Text style={[type.title, styles.figure]}>
        {places} places in {countries} countries
      </Text>
      <Body secondary>Ranked by the yearly revenue their companies report, then by places. Choose one to follow it round the globe.</Body>
      <View style={styles.list}>
        {board.map(({ e, revenue, places: n, countries: k }, i) => (
          <Pressable
            key={e.person.id}
            accessibilityRole="button"
            accessibilityLabel={`Number ${i + 1}, ${e.person.name}: ${revenue ? `${usd(revenue)} revenue, ` : ''}${n} places in ${k} countries. Follow`}
            onPress={() => onSelect(e.person.id)}
            style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressedRow]}>
            <View style={[styles.place, i < 3 && { backgroundColor: MEDAL[i] }]}>
              <Text style={[type.number, { fontSize: 13, color: i < 3 ? '#FFFFFF' : color.text }]}>{i + 1}</Text>
            </View>
            <Portrait uri={e.person.portrait_url} name={e.person.name} size={36} />
            <View style={styles.flex}>
              <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                {e.person.name}
              </Text>
              <View style={styles.tags}>
                {revenue > 0 && (
                  <Tag size="sm" variant="soft" color="default">
                    <Tag.Label>{usd(revenue)}/yr</Tag.Label>
                  </Tag>
                )}
                <Tag size="sm" variant="soft" color="default">
                  <Tag.Label>{n} {n === 1 ? 'place' : 'places'}</Tag.Label>
                </Tag>
                {k > 1 && (
                  <Tag size="sm" variant="soft" color="default">
                    <Tag.Label>{k} countries</Tag.Label>
                  </Tag>
                )}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </Surface>
  );
}

function EmpirePanel({ empire }: { empire: Empire }) {
  const all = empire.companies.flatMap((c) => c.sites);
  const countries = new Set(all.map((s) => s.country).filter(Boolean)).size;
  return (
    <Surface style={styles.panelCard}>
      <View style={styles.who}>
        <Portrait uri={empire.person.portrait_url} name={empire.person.name} size={56} rounded={16} />
        <View style={styles.flex}>
          <Text style={[type.title, { color: color.text }]}>{empire.person.name}</Text>
          <Caption>
            {all.length} {all.length === 1 ? 'place' : 'places'} in {countries} {countries === 1 ? 'country' : 'countries'}
          </Caption>
        </View>
      </View>
      <Link href={`/person/${empire.person.slug}`} style={styles.link}>
        Open profile
      </Link>
      {empire.companies.map((c) => (
        <Fragment key={c.id}>
          <View style={styles.rule} />
          <CompanySection company={c} stake={empire.stakes.find((s) => s.company.id === c.id)} worth={empire.person.net_worth_usd} />
        </Fragment>
      ))}
    </Surface>
  );
}

function CompanySection({ company: c, stake, worth }: { company: CompanyView; stake?: Stake; worth: number | null }) {
  const q = c.quote;
  const kinds = new Map<SiteKind, CompanyView['sites']>();
  for (const s of c.sites) kinds.set(s.kind, [...(kinds.get(s.kind) ?? []), s]);
  return (
    <View style={styles.company}>
      <View style={styles.companyHead}>
        <View style={styles.companyName}>
          <Text style={[type.headline, { color: color.text }]}>{c.name}</Text>
          <Caption>{c.is_private ? 'Private company' : c.ticker}</Caption>
        </View>
        {q?.prev_close ? (
          <View style={styles.price}>
            <Change delta={q.price - q.prev_close} base={q.prev_close} size={15} compact />
            <Caption style={styles.priceTime}>
              {isLive(q) ? 'Today, ' : 'Last price, '}
              {formatTime(q.as_of)} {isLive(q) ? '' : formatDate(q.as_of)}
            </Caption>
          </View>
        ) : null}
      </View>

      {stake ? (
        <View style={styles.block} accessible>
          <Text style={[type.body, { color: color.text }]}>
            {formatShares(stake.shares)} shares{stake.value ? ` · ${usd(stake.value)} at the latest price` : ''}
            {stake.value && worth ? ` · ${Math.round((stake.value / worth) * 100)}% of the fortune` : ''}
          </Text>
          <SourceLink label={stake.label ?? 'SEC filing'} url={stake.url} />
        </View>
      ) : null}

      {c.regions.length ? (
        <View style={styles.block}>
          <Caption>Revenue by place, fiscal {c.regions[0].fiscal_year}</Caption>
          {c.regions.map((r) => (
            <View key={r.region} style={styles.share} accessible accessibilityLabel={`${r.region}: ${Math.round(r.share * 100)} percent of revenue`}>
              <Text style={[type.body, styles.flex, { color: color.text }]} numberOfLines={2}>
                {r.region}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: `${Math.max(r.share * 100, 2)}%` }]} />
              </View>
              <Text style={[type.number, styles.pct, { color: color.text }]}>{Math.round(r.share * 100)}%</Text>
            </View>
          ))}
          <SourceLink label={c.regions[0].source_label} url={c.regions[0].source_url} />
        </View>
      ) : (
        <Caption style={styles.block}>
          {c.is_private ? 'Private company: no public filings break down its revenue.' : 'Its annual report doesn’t break revenue down by place.'}
        </Caption>
      )}

      {c.sites.length ? (
        <View style={styles.block}>
          {[...kinds].map(([kind, list]) => (
            <Body key={kind}>
              <Text style={{ fontFamily: type.headline.fontFamily }}>{KIND[kind][list.length === 1 ? 0 : 1]}: </Text>
              {list
                .slice(0, 6)
                .map((s) => (kind === 'hq' ? (s.city ?? s.name) : s.country ? `${s.name} (${country(s.country)})` : s.name))
                .join(', ')}
              {list.length > 6 ? `, and ${list.length - 6} more` : ''}
            </Body>
          ))}
          <SourceLink label="Places from Wikidata" url={c.source_url} />
        </View>
      ) : null}

      {c.subsidiaries > 0 && <SourceLink label={`${c.subsidiaries} subsidiaries listed in its annual report`} url={c.subsidiariesUrl} />}
    </View>
  );
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { gap: space.sm, paddingVertical: 2 },
  // Four equal segments across the width, so they fit a 320px phone; capped on desktop.
  segments: { flexDirection: 'row', alignSelf: 'stretch', maxWidth: 520, padding: 3, borderRadius: radius.pill, backgroundColor: color.fill },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: radius.pill },
  segmentOn: { backgroundColor: color.surface },
  chip: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  chipOn: { backgroundColor: color.actionTint },
  pressed: { opacity: 0.75 },
  layout: { gap: space.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  globeCard: { padding: space.md, gap: space.md },
  // No card: the planet behind the page is the globe; the area is just where it sits and where gestures land.
  planetArea: { gap: space.sm },
  globeCardWide: { padding: space.lg },
  globeNote: { textAlign: 'center', maxWidth: 420, alignSelf: 'center' },
  panel: { gap: space.lg },
  panelWide: { flex: 1, minWidth: 0 },
  panelCard: { padding: space.lg, gap: space.md },
  figure: { color: color.text, fontVariant: ['tabular-nums'] },
  list: { marginHorizontal: -space.lg },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  pressedRow: { backgroundColor: color.fill },
  place: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  link: { ...type.headline, color: color.action, alignSelf: 'flex-start', paddingVertical: space.sm },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  company: { gap: space.md },
  companyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  // The name keeps its room on narrow phones; the price time wraps instead.
  companyName: { flexGrow: 1, flexShrink: 0, minWidth: 96, maxWidth: '50%' },
  price: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  priceTime: { textAlign: 'right' },
  block: { gap: space.sm },
  share: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barTrack: { width: 56, height: 6, borderRadius: 3, backgroundColor: color.fill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.text },
  pct: { width: 44, textAlign: 'right', fontSize: 15 },
  source: { alignSelf: 'flex-start', minHeight: minTouch, justifyContent: 'center' },
});
