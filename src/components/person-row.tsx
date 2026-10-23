import { Link } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type PressableStateCallbackType } from 'react-native';

import { Caption, Change, Icon, Portrait, Surface, icons, minTouch } from '@/components/ui';
import type { Person } from '@/lib/data';
import { formatDate, usd } from '@/lib/format';
import { color, space, type } from '@/theme';

/** One ranked person: portrait with rank badge, name and source, value, change. Taps through to the profile. */
export function PersonRow({ person, showRank = true }: { person: Person; showRank?: boolean }) {
  const narrow = useWindowDimensions().width < 520;
  const worth = person.net_worth_usd;
  const delta = worth != null && person.prev_net_worth_usd != null ? worth - person.prev_net_worth_usd : null;
  const label = [
    showRank && person.rank ? `Rank ${person.rank}` : null,
    person.name,
    worth != null ? `${usd(worth)}` : 'no estimate yet',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Link href={`/person/${person.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint="Opens profile"
        style={styles.pressable}>
        {/* Pressed/hover styling lives on an inner view: Link asChild (Slot) drops function styles. */}
        {({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <View style={[styles.row, (pressed || hovered) && styles.active]}>
        <View>
          <Portrait uri={person.portrait_url} name={person.name} size={narrow ? 44 : 48} />
          {showRank && person.rank != null && (
            <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.badgeText}>{person.rank}</Text>
            </View>
          )}
        </View>
        <View style={styles.identity}>
          <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
            {person.name}
          </Text>
          <Caption numberOfLines={1}>{person.main_source ?? ' '}</Caption>
        </View>
        <View style={styles.value}>
          {worth != null ? (
            <>
              <Text style={[type.number, styles.worth]}>{usd(worth)}</Text>
              {delta != null ? (
                <Change delta={delta} base={person.prev_net_worth_usd!} size={13} compact={narrow} />
              ) : (
                <Caption>{person.as_of ? `as of ${formatDate(person.as_of)}` : ''}</Caption>
              )}
            </>
          ) : (
            <Caption>No estimate yet</Caption>
          )}
        </View>
        <Icon name={icons.chevron} size={13} tint={color.hairline} />
        </View>
        )}
      </Pressable>
    </Link>
  );
}

export function PersonList({ people, showRank = true }: { people: Person[]; showRank?: boolean }) {
  return (
    <Surface style={styles.list}>
      {people.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <View style={styles.separator} />}
          <PersonRow person={p} showRank={showRank} />
        </Fragment>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden', paddingVertical: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: 80 },
  pressable: { display: 'flex' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouch + 20,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  active: { backgroundColor: color.fill },
  // Rank sits on the portrait's top-left corner to save a column; ringed so it reads on any photo.
  badge: {
    position: 'absolute',
    top: -4,
    left: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.surface,
    backgroundColor: color.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.number, fontSize: 11, lineHeight: 13, color: '#FFFFFF' },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  value: { alignItems: 'flex-end', gap: 2 },
  worth: { fontSize: 17, color: color.text, letterSpacing: -0.3 },
});
