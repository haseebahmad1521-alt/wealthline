import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PersonList } from '@/components/person-row';
import { Body, Heading, Icon, Screen, StateView, icons, minTouch } from '@/components/ui';
import { usePeople } from '@/lib/data';
import { color, font, radius, space } from '@/theme';

export default function People() {
  const people = usePeople();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const sorted = [...(people.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const shown = q
    ? sorted.filter((p) => [p.name, p.main_source, p.citizenship].some((v) => v?.toLowerCase().includes(q)))
    : sorted;

  return (
    <Screen>
      <View>
        <Heading>People.</Heading>
        <Body secondary>Everyone we track, A to Z.</Body>
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
