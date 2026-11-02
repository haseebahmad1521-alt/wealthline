import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Movers, Overtakes, Podium, Races } from '@/components/arena';
import { BriefCard } from '@/components/news';
import { PageSearch } from '@/components/page-search';
import { PersonList } from '@/components/person-row';
import { SavedViews, useAppliedView } from '@/components/saved-views';
import { Ticker, TickerSpace } from '@/components/ticker';
import { Body, Button, Caption, Heading, Icon, Screen, StateView, Surface, icons, minTouch } from '@/components/ui';
import { rankMoves } from '@/lib/arena';
import { matches, setSearch, useSearch } from '@/lib/search';
import { useLatestBrief, usePeople } from '@/lib/data';
import { useScrollClear } from '@/lib/scroll-clear';
import { peopleSorts, sortLabels, sortPeople, type PeopleSort } from '@/lib/view-params';
import { color, radius, space, type } from '@/theme';

const MAX_COMPARE = 3;

export default function Rankings() {
  const people = usePeople();
  const brief = useLatestBrief();
  const query = useSearch('people');
  const setQuery = (q: string) => setSearch('people', q);
  const [sort, setSort] = useState<PeopleSort>('rank');
  const [comparing, setComparing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const narrow = useWindowDimensions().width < 420;
  const [selected, setSelected] = useState<string[]>([]);
  const { view } = useLocalSearchParams<{ view?: string }>();
  const applied = useAppliedView('people', view);
  const [seen, setSeen] = useState<string>();
  if (applied && applied.target === 'people' && seen !== applied.id) {
    setSeen(applied.id);
    setQuery(applied.params.q);
    setSort(applied.params.sort);
  }
  const clear = useScrollClear();
  const moves = useMemo(() => rankMoves(people.data ?? []), [people.data]);
  // The game layer shows on the plain leaderboard; searching, sorting or comparing goes straight to the list.
  const arena = !query.trim() && sort === 'rank' && !comparing;
  const q = query.trim().toLowerCase();
  // Rank sort lists people without an estimate after the ranked ones.
  const sorted = sortPeople(people.data ?? [], sort);
  const shown = q ? sorted.filter((p) => matches(q, p.name, p.main_source, p.citizenship)) : sorted;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_COMPARE ? [...s, id] : s));
  const stop = () => {
    setComparing(false);
    setSelected([]);
  };
  const confirm = () => {
    const ids = selected.join(',');
    setComparing(false);
    setSelected([]);
    router.push({ pathname: '/compare', params: { ids } });
  };

  return (
    <View style={styles.page}>
      {/* Web: the faster you scroll, the clearer this page's glass, so the planet shows through. */}
      <View ref={clear} style={styles.page}>
        <Screen>
          <TickerSpace />
          <View>
            <Heading>Rankings.</Heading>
            <Body secondary>The world’s biggest fortunes.</Body>
          </View>
          {/* One row: filters, search, compare. Sort and saved views live in the filter panel. */}
          <View style={styles.bar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filters"
              accessibilityHint="Sort and saved views"
              accessibilityState={{ expanded: filtersOpen }}
              onPress={() => setFiltersOpen(!filtersOpen)}
              style={[styles.round, (filtersOpen || sort !== 'rank') && styles.roundOn]}>
              <Icon name={icons.filter} size={18} tint={filtersOpen || sort !== 'rank' ? color.action : color.text} />
            </Pressable>
            {/* Native: the shared search, inline (web: in the app chrome). Narrow screens give compare mode the room. */}
            {!(comparing && narrow) && (Platform.OS === 'web' ? <View style={styles.grow} /> : <PageSearch context="people" style={styles.grow} />)}
            {comparing ? (
              <>
                <View style={narrow ? styles.grow : undefined}>
                  <Button label="Confirm" disabled={selected.length < 2} onPress={confirm} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel compare" onPress={stop} style={styles.round}>
                  <Icon name={icons.close} size={16} tint={color.text} />
                </Pressable>
              </>
            ) : (
              <Button label="Compare" variant="secondary" onPress={() => setComparing(true)} />
            )}
          </View>
          {filtersOpen && (
            <Surface style={styles.panel}>
              <Caption>Sort by</Caption>
              <View accessibilityRole="tablist" style={styles.segments}>
                {peopleSorts.map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="tab"
                    accessibilityLabel={`Sort by ${sortLabels[s].toLowerCase()}`}
                    accessibilityState={{ selected: sort === s }}
                    onPress={() => setSort(s)}
                    style={[styles.segment, sort === s && styles.segmentOn]}>
                    <Text style={[type.headline, { color: sort === s ? color.text : color.textSecondary }]}>{sortLabels[s]}</Text>
                  </Pressable>
                ))}
              </View>
              <SavedViews
                target="people"
                params={{ q: query.trim(), sort }}
                onApply={(v) => {
                  if (v.target !== 'people') return;
                  setQuery(v.params.q);
                  setSort(v.params.sort);
                }}
              />
            </Surface>
          )}
          {comparing && (
            <View accessibilityLiveRegion="polite">
              <Caption>{`Select 2–3 people to compare. ${selected.length} selected.`}</Caption>
              {selected.length >= MAX_COMPARE && <Caption>Compare up to 3 people.</Caption>}
            </View>
          )}
          {people.isPending || people.error ? (
            <StateView loading={people.isPending} error={people.error} onRetry={() => void people.refetch()} />
          ) : sorted.length === 0 ? (
            <StateView empty={{ title: 'No one ranked yet.', body: 'Estimates appear here once they’ve been sourced and entered.' }} />
          ) : shown.length === 0 ? (
            <StateView empty={{ title: `No one matches “${query.trim()}”.`, body: 'Try a different name, source, or country.' }} />
          ) : (
            <>
              {arena && (
                <>
                  <Podium people={people.data ?? []} />
                  <Movers people={people.data ?? []} />
                  <Races people={people.data ?? []} />
                  <Overtakes people={people.data ?? []} />
                  <Heading level={2}>Leaderboard.</Heading>
                </>
              )}
              <PersonList people={shown} selectedIds={comparing ? selected : undefined} onToggle={toggle} moves={moves} />
              <Caption>Portraits from Wikimedia Commons. Each profile credits its photographer and links the license.</Caption>
              <BriefCard brief={brief.data} people={people.data ?? []} />
            </>
          )}
        </Screen>
      </View>
      <Ticker />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  panel: { padding: space.md, gap: space.sm },
  round: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: color.actionTint },
  segments: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  segment: {
    minHeight: minTouch,
    minWidth: 72,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: color.surface },
});
