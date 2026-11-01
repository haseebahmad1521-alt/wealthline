// Game-like Rankings pieces (owner's direction, Nov 1, 2026): podium, the day's movers, closest races, overtakes and
// rank-move badges. All numbers come from recorded values via lib/arena.ts; motion is entrance only, never data.
import { Link } from 'expo-router';
import { Card, Chip } from 'heroui-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ReduceMotion } from 'react-native-reanimated';

import { Caption, Change, Heading, Icon, Portrait, icons } from '@/components/ui';
import { closestRaces, overtakes, topMovers } from '@/lib/arena';
import { useMoney } from '@/lib/currency';
import type { Person } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { color, radius, space, type } from '@/theme';

// Medal tones for ranks 1–3 (game layer only; text on them stays dark or white at AA contrast).
export const MEDAL = ['#C9971C', '#8A96A3', '#A8653A'] as const;

const enter = (i: number) => FadeInUp.delay(i * 90).springify().damping(14).reduceMotion(ReduceMotion.System);

/** ▲ 2 / ▼ 1 places since the previous values; nothing when unchanged or unknown. */
export function RankMove({ places, compact }: { places: number | undefined; compact?: boolean }) {
  if (!places) return null;
  const up = places > 0;
  return (
    <View
      style={[styles.move, { backgroundColor: up ? color.gainTint : '#FBEAE8' }]}
      accessible
      accessibilityLabel={`${up ? 'Up' : 'Down'} ${Math.abs(places)} ${Math.abs(places) === 1 ? 'place' : 'places'}`}>
      <Icon name={up ? icons.up : icons.down} size={compact ? 13 : 15} tint={up ? color.gain : color.loss} />
      <Text style={[type.number, { fontSize: compact ? 12 : 13, color: up ? color.gain : color.loss }]}>{Math.abs(places)}</Text>
    </View>
  );
}

function Step({ person, place, height, i }: { person: Person; place: number; height: number; i: number }) {
  const money = useMoney();
  const delta = person.net_worth_usd != null && person.prev_net_worth_usd != null ? person.net_worth_usd - person.prev_net_worth_usd : null;
  const size = place === 1 ? 76 : 58;
  return (
    <Link href={`/person/${person.slug}`} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`Number ${place}, ${person.name}, ${person.net_worth_usd != null ? money.format(person.net_worth_usd) : ''}`} style={styles.step}>
        <Animated.View entering={FadeInDown.delay(250 + i * 90).reduceMotion(ReduceMotion.System)} style={styles.stepTop}>
          <View style={[styles.ring, { borderColor: MEDAL[place - 1], borderRadius: (size + 8) / 2 }]}>
            <Portrait uri={person.portrait_url} name={person.name} size={size} />
          </View>
          <Text style={[type.headline, styles.center, { color: color.text }]} numberOfLines={2}>
            {person.name.replace(/ & family$/, '')}
          </Text>
          {person.net_worth_usd != null && <Text style={[type.number, { color: color.text, fontSize: place === 1 ? 18 : 15 }]}>{money.format(person.net_worth_usd)}</Text>}
          {delta != null && <Change delta={delta} base={person.prev_net_worth_usd!} size={12} compact />}
        </Animated.View>
        <Animated.View entering={enter(i)} style={[styles.pedestal, { height, backgroundColor: MEDAL[place - 1] }]}>
          <Text style={styles.pedestalText}>{place}</Text>
        </Animated.View>
      </Pressable>
    </Link>
  );
}

/** Top three on a podium: #2, #1 (tallest), #3. */
export function Podium({ people }: { people: Person[] }) {
  const top = people.filter((p) => p.rank != null && p.rank <= 3).sort((a, b) => a.rank! - b.rank!);
  if (top.length < 3) return null;
  return (
    <Card style={styles.podiumCard}>
      <View style={styles.podium} accessibilityRole="list" accessibilityLabel="Top three">
        <Step person={top[1]} place={2} height={74} i={1} />
        <Step person={top[0]} place={1} height={104} i={0} />
        <Step person={top[2]} place={3} height={56} i={2} />
      </View>
    </Card>
  );
}

function MoverCard({ title, person, delta, base, up }: { title: string; person: Person; delta: number; base: number; up: boolean }) {
  return (
    <Link href={`/person/${person.slug}`} asChild>
      <Pressable accessibilityRole="link" style={styles.flex}>
        <Card style={[styles.mover, { borderColor: up ? color.gain : color.loss }]}>
          <Chip size="sm" variant="soft" color={up ? 'success' : 'danger'}>
            <Chip.Label>{title}</Chip.Label>
          </Chip>
          <View style={styles.moverWho}>
            <Portrait uri={person.portrait_url} name={person.name} size={40} />
            <Text style={[type.headline, styles.flex, { color: color.text }]} numberOfLines={2}>
              {person.name.replace(/ & family$/, '')}
            </Text>
          </View>
          <Change delta={delta} base={base} size={16} />
        </Card>
      </Pressable>
    </Link>
  );
}

/** The biggest gain and drop since the previous values. */
export function Movers({ people }: { people: Person[] }) {
  const { up, down } = topMovers(people);
  if (!up && !down) return null;
  const since = (up ?? down)!.person.prev_as_of;
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Heading level={2}>Today’s movers.</Heading>
        {since && <Caption>since {formatDate(since)}</Caption>}
      </View>
      <View style={styles.pair}>
        {up && <MoverCard title="Biggest gain" person={up.person} delta={up.delta} base={up.base} up />}
        {down && <MoverCard title="Biggest drop" person={down.person} delta={down.delta} base={down.base} up={false} />}
      </View>
    </View>
  );
}

/** Neighbours with the smallest gaps: a tug-of-war bar per pair. */
export function Races({ people }: { people: Person[] }) {
  const money = useMoney();
  const races = closestRaces(people);
  if (!races.length) return null;
  return (
    <View style={styles.section}>
      <Heading level={2}>Closest races.</Heading>
      <Card style={styles.list}>
        {races.map((r, i) => (
          <Animated.View key={`${r.leader.id}:${r.chaser.id}`} entering={enter(i)} style={[styles.race, i > 0 && styles.sep]}>
            <View style={styles.raceRow} accessible accessibilityLabel={`Number ${r.rank} ${r.leader.name} leads number ${r.rank + 1} ${r.chaser.name} by ${money.format(r.gap)}`}>
              <Portrait uri={r.leader.portrait_url} name={r.leader.name} size={34} />
              <View style={styles.flex}>
                <View style={styles.raceNames}>
                  <Text style={[type.headline, styles.flex, { color: color.text, fontSize: 15 }]} numberOfLines={1}>
                    #{r.rank} {r.leader.name.replace(/ & family$/, '')}
                  </Text>
                  <Text style={[type.headline, styles.flex, styles.right, { color: color.text, fontSize: 15 }]} numberOfLines={1}>
                    #{r.rank + 1} {r.chaser.name.replace(/ & family$/, '')}
                  </Text>
                </View>
                <View style={styles.tug}>
                  <View style={[styles.tugLeft, { flex: r.share }]} />
                  <View style={[styles.tugRight, { flex: 1 - r.share }]} />
                </View>
                <Caption style={styles.centerText}>{money.format(r.gap)} apart</Caption>
              </View>
              <Portrait uri={r.chaser.portrait_url} name={r.chaser.name} size={34} />
            </View>
          </Animated.View>
        ))}
      </Card>
    </View>
  );
}

/** Who passed whom since the previous values. */
export function Overtakes({ people }: { people: Person[] }) {
  const money = useMoney();
  const list = overtakes(people).slice(0, 5);
  if (!list.length) return null;
  return (
    <View style={styles.section}>
      <Heading level={2}>Overtakes.</Heading>
      <Card style={styles.list}>
        {list.map((o, i) => (
          <View key={`${o.winner.id}:${o.passed.id}`} style={[styles.raceRow, styles.race, i > 0 && styles.sep]} accessible>
            <Icon name={icons.up} size={20} tint={color.gain} />
            <Portrait uri={o.winner.portrait_url} name={o.winner.name} size={30} />
            <Text style={[type.body, styles.flex, { color: color.text }]}>
              <Text style={{ fontFamily: type.headline.fontFamily }}>{o.winner.name.replace(/ & family$/, '')}</Text> passed {o.passed.name.replace(/ & family$/, '')}
            </Text>
            <Caption>+{money.format(o.gap)}</Caption>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  centerText: { textAlign: 'center' },
  right: { textAlign: 'right' },
  section: { gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  podiumCard: { paddingTop: space.lg, paddingHorizontal: space.sm, paddingBottom: 0, overflow: 'hidden', borderRadius: radius.lg },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  step: { flex: 1, minWidth: 0, alignItems: 'center' },
  stepTop: { alignItems: 'center', gap: 4, paddingHorizontal: 2, paddingBottom: space.sm },
  ring: { borderWidth: 4, padding: 0 },
  pedestal: { alignSelf: 'stretch', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  pedestalText: { ...type.title, color: '#FFFFFF', fontSize: 30, lineHeight: 34 },
  pair: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  mover: { padding: space.md, gap: space.sm, borderWidth: 2, borderRadius: radius.md, minWidth: 140 },
  moverWho: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  list: { paddingVertical: space.xs, borderRadius: radius.lg },
  race: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  raceNames: { flexDirection: 'row', gap: space.sm },
  tug: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 4, gap: 2 },
  tugLeft: { backgroundColor: color.text },
  tugRight: { backgroundColor: color.hairline },
  move: { flexDirection: 'row', alignItems: 'center', gap: 1, borderRadius: radius.pill, paddingLeft: 3, paddingRight: 7, paddingVertical: 1 },
});
