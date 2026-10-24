import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PersonList } from '@/components/person-row';
import { SavedViews, useAppliedView } from '@/components/saved-views';
import { Body, Heading, Icon, Screen, StateView, icons, minTouch } from '@/components/ui';
import { usePeople } from '@/lib/data';
import { peopleSorts, sortLabels, sortPeople, type PeopleSort } from '@/lib/view-params';
import { color, font, radius, space, type } from '@/theme';

export default function People() {
  const people = usePeople();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PeopleSort>('name');
  const { view } = useLocalSearchParams<{ view?: string }>();
  const applied = useAppliedView('people', view);
  const [seen, setSeen] = useState<string>();
  if (applied && applied.target === 'people' && seen !== applied.id) {
    setSeen(applied.id);
    setQuery(applied.params.q);
    setSort(applied.params.sort);
  }
  const q = query.trim().toLowerCase();
  const sorted = sortPeople(people.data ?? [], sort);
  const shown = q
    ? sorted.filter((p) => [p.name, p.main_source, p.citizenship].some((v) => v?.toLowerCase().includes(q)))
    : sorted;

  return (
    <Screen>
      <View>
        <Heading>People.</Heading>
        <Body secondary>Everyone we track.</Body>
      </View>
      <View style={styles.search}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, source, or country"
          placeholderTextColor={color.textSecondary}
          accessibilityLabel="Search people"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
        {query.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery('')}
            style={styles.clear}>
            <Icon name={icons.close} size={14} tint={color.textSecondary} />
          </Pressable>
        )}
      </View>
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
      {people.isPending || people.error ? (
        <StateView loading={people.isPending} error={people.error} onRetry={() => void people.refetch()} />
      ) : sorted.length === 0 ? (
        <StateView empty={{ title: 'No one here yet.', body: 'People appear once they’ve been added.' }} />
      ) : shown.length === 0 ? (
        <StateView empty={{ title: `No one matches “${query.trim()}”.`, body: 'Try a different name, source, or country.' }} />
      ) : (
        <PersonList people={shown} showRank={false} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  segment: {
    minHeight: minTouch,
    minWidth: 80,
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
  },
  input: { flex: 1, minHeight: minTouch, fontFamily: font.regular, fontSize: 16, color: color.text },
  clear: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
