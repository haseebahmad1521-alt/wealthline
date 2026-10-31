import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Globe } from '@/components/globe';
import { Caption, Surface } from '@/components/ui';
import { useWorld } from '@/lib/world';
import { color, space, type } from '@/theme';

/** Profile card: a small still globe of one person's company places, opening the World tab focused on them. */
export function EmpireCard({ personId }: { personId: string }) {
  const world = useWorld();
  const empire = world.data?.find((e) => e.person.id === personId);
  if (!empire?.hq) return null;
  const sites = empire.companies.flatMap((c) =>
    c.sites.map((s) => ({ key: `${c.id}:${s.kind}:${s.name}`, lat: s.lat, lng: s.lng, kind: s.kind, group: personId, live: false, country: s.country })),
  );
  const countries = new Set(sites.map((s) => s.country).filter(Boolean)).size;
  const summary = `${sites.length} ${sites.length === 1 ? 'place' : 'places'} in ${countries} ${countries === 1 ? 'country' : 'countries'}`;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${summary}. See on the World map.`}
      onPress={() => router.push({ pathname: '/world', params: { focus: empire.person.slug } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <Surface style={styles.card}>
        <Globe size={112} sites={sites} markers={[]} focus={personId} center={empire.hq} spin={false} label={summary} />
        <View style={styles.text}>
          <Text style={[type.headline, { color: color.text }]}>{summary}</Text>
          <Caption>{empire.companies.map((c) => c.name).join(', ')}</Caption>
          <Text style={[type.headline, { color: color.action }]}>See on the World map</Text>
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  text: { flex: 1, minWidth: 0, gap: space.xs },
  pressed: { opacity: 0.75 },
});
