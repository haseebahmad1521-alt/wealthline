import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { BriefCard } from '@/components/news';
import { PersonList } from '@/components/person-row';
import { SavedViews, useAppliedView } from '@/components/saved-views';
import { Body, Button, Caption, Heading, Icon, Screen, StateView, Surface, icons, minTouch } from '@/components/ui';
import { useLatestBrief, usePeople } from '@/lib/data';
import { peopleSorts, sortLabels, sortPeople, type PeopleSort } from '@/lib/view-params';
import { color, font, radius, space, type } from '@/theme';

const MAX_COMPARE = 3;

export default function Rankings() {
  const people = usePeople();
  const brief = useLatestBrief();
  const [query, setQuery] = useState('');
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
  const q = query.trim().toLowerCase();
  // Rank sort lists people without an estimate after the ranked ones.
  const sorted = sortPeople(people.data ?? [], sort);
  const shown = q
    ? sorted.filter((p) => [p.name, p.main_source, p.citizenship].some((v) => v?.toLowerCase().includes(q)))
    : sorted;

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
    <Screen>
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
        {/* Narrow screens give compare mode the room: search returns when compare ends. */}
        {!(comparing && narrow) && (
        <View style={styles.search}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={color.textSecondary}
            accessibilityLabel="Search by name, source, or country"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
          />
          {query.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}>
              <Icon name={icons.close} size={14} tint={color.textSecondary} />
            </Pressable>
          )}
        </View>
        )}
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
          <PersonList people={shown} selectedIds={comparing ? selected : undefined} onToggle={toggle} />
          <Caption>Portraits from Wikimedia Commons. Each profile credits its photographer and links the license.</Caption>
          <BriefCard brief={brief.data} people={people.data ?? []} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouch,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    paddingLeft: space.md,
    flex: 1,
    minWidth: 0,
  },
  input: { flex: 1, minWidth: 0, minHeight: minTouch, fontFamily: font.regular, fontSize: 16, color: color.text },
  clear: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
