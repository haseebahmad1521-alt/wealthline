import { Link, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Globe, type GlobeMarker, type GlobeSite } from '@/components/globe';
import { Body, Caption, Change, Heading, Portrait, Screen, StateView, Surface, minTouch } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import { LIVE_QUOTE_MS, useWorld, type CompanyView, type Empire, type Quote, type SiteKind } from '@/lib/world';
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

const isLive = (q: Quote | null) => !!q && Date.now() - Date.parse(q.as_of) < LIVE_QUOTE_MS;
const open = (url: string | null) => url && void WebBrowser.openBrowserAsync(url);

export default function World() {
  const world = useWorld();
  const { width } = useWindowDimensions();
  const desktop = width >= desktopBreakpoint;
  const { focus: slug } = useLocalSearchParams<{ focus?: string }>();
  const empires = world.data ?? [];
  const focused = empires.find((e) => e.person.slug === slug) ?? null;

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
            <Chip label="Everyone" selected={!focused} onPress={() => select(null)} />
            {empires.map((e) => (
              <Chip key={e.person.id} label={e.person.name} selected={focused?.person.id === e.person.id} onPress={() => select(e.person.id)} empire={e} />
            ))}
          </ScrollView>
          <View style={[styles.layout, desktop && styles.layoutWide]}>
            <Surface style={[styles.globeCard, desktop && styles.globeCardWide]}>
              <Globe
                size={globeSize}
                sites={sites}
                markers={markers}
                focus={focused?.person.id ?? null}
                center={focused?.hq ?? null}
                onSelect={(id) => select(id)}
                label={
                  focused
                    ? `Globe turned to ${focused.person.name}'s companies: ${focused.companies.reduce((n, c) => n + c.sites.length, 0)} places. Details follow.`
                    : `Globe of ${places} company places for ${empires.length} people. Details follow.`
                }
              />
              <Caption style={styles.globeNote}>
                Drag to turn. Places from Wikidata; brighter, quicker rings mean the company’s share price moved in the last 30 minutes.
              </Caption>
            </Surface>
            <View style={[styles.panel, desktop && styles.panelWide]}>
              {focused ? <EmpirePanel empire={focused} /> : <Overview empires={empires} places={places} onSelect={select} />}
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

function Overview({ empires, places, onSelect }: { empires: Empire[]; places: number; onSelect: (id: string) => void }) {
  const countries = new Set(empires.flatMap((e) => e.companies.flatMap((c) => c.sites.map((s) => s.country).filter(Boolean)))).size;
  return (
    <Surface style={styles.panelCard}>
      <Heading level={2}>Everyone.</Heading>
      <Text style={[type.title, styles.figure]}>
        {places} places in {countries} countries
      </Text>
      <Body secondary>
        Headquarters, factories, launch sites, data centres and offices owned or run by the companies behind {empires.length} fortunes.
        Choose a person to follow one empire.
      </Body>
      <View style={styles.list}>
        {empires.map((e, i) => (
          <Pressable
            key={e.person.id}
            accessibilityRole="button"
            accessibilityLabel={`Follow ${e.person.name}`}
            onPress={() => onSelect(e.person.id)}
            style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressedRow]}>
            <Portrait uri={e.person.portrait_url} name={e.person.name} size={36} />
            <View style={styles.flex}>
              <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                {e.person.name}
              </Text>
              <Caption numberOfLines={1}>
                {e.companies.map((c) => c.name).join(', ')} · {e.companies.reduce((n, c) => n + c.sites.length, 0)} places
              </Caption>
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
          <CompanySection company={c} />
        </Fragment>
      ))}
    </Surface>
  );
}

function CompanySection({ company: c }: { company: CompanyView }) {
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
