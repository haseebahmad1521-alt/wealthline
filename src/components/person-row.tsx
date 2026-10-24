import { Link } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type PressableStateCallbackType } from 'react-native';

import { Caption, Change, Icon, Portrait, Surface, icons, minTouch } from '@/components/ui';
import type { Person } from '@/lib/data';
import { useMoney } from '@/lib/currency';
import { formatDate } from '@/lib/format';
import { color, space, type } from '@/theme';

/** One ranked person: portrait with rank badge, name and source, value, change. Taps through to the profile. */
export function PersonRow({
  person,
  showRank = true,
  selection,
}: {
  person: Person;
  showRank?: boolean;
  /** Compare mode: the row toggles selection instead of opening the profile. */
  selection?: { selected: boolean; onToggle: () => void };
}) {
  const width = useWindowDimensions().width;
  const narrow = width < 520;
  const tiny = width < 360; // 320px phones: smaller portrait, no chevron, so names and sources fit
  const money = useMoney();
  const worth = person.net_worth_usd;
  const delta = worth != null && person.prev_net_worth_usd != null ? worth - person.prev_net_worth_usd : null;
  const label = [
    showRank && person.rank ? `Rank ${person.rank}` : null,
    person.name,
    worth != null ? money.format(worth) : 'no estimate yet',
  ]
    .filter(Boolean)
    .join(', ');

  const body = ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <View style={[styles.row, (pressed || hovered) && styles.active, selection?.selected && styles.selected]}>
        <View>
          <Portrait uri={person.portrait_url} name={person.name} size={tiny ? 36 : narrow ? 44 : 48} />
          {showRank && person.rank != null && (
            <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.badgeText}>{person.rank}</Text>
            </View>
          )}
        </View>
        <View style={styles.identity}>
          <Text style={[type.headline, { color: color.text }]} numberOfLines={2}>
            {person.name}
          </Text>
          <Caption numberOfLines={1}>{person.main_source ?? ' '}</Caption>
        </View>
        <View style={styles.value}>
          {worth != null ? (
            <>
              <Text style={[type.number, styles.worth]}>{money.format(worth)}</Text>
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
        {selection ? (
          <View style={[styles.check, selection.selected && styles.checkOn]}>
            {selection.selected && <Icon name={icons.check} size={13} tint="#FFFFFF" />}
          </View>
        ) : tiny ? null : (
          <Icon name={icons.chevron} size={13} tint={color.hairline} />
        )}
        </View>
  );

  if (selection) {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selection.selected }}
        accessibilityLabel={label}
        onPress={selection.onToggle}
        style={styles.pressable}>
        {body}
      </Pressable>
    );
  }

  return (
    <Link href={`/person/${person.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint="Opens profile"
        style={styles.pressable}>
        {/* Pressed/hover styling lives on an inner view: Link asChild (Slot) drops function styles. */}
        {body}
      </Pressable>
    </Link>
  );
}

function useDividerInset() {
  const w = useWindowDimensions().width;
  return 32 + (w < 360 ? 36 : w < 520 ? 44 : 48);
}

export function PersonList({
  people,
  showRank = true,
  selectedIds,
  onToggle,
}: {
  people: Person[];
  showRank?: boolean;
  /** Present only in compare mode. */
  selectedIds?: string[];
  onToggle?: (id: string) => void;
}) {
  const inset = useDividerInset();
  return (
    <Surface style={styles.list}>
      {people.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && <View style={[styles.separator, { marginLeft: inset }]} />}
          <PersonRow
            person={p}
            showRank={showRank}
            selection={selectedIds && onToggle ? { selected: selectedIds.includes(p.id), onToggle: () => onToggle(p.id) } : undefined}
          />
        </Fragment>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden', paddingVertical: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
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
  selected: { backgroundColor: color.actionTint },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.action, borderColor: color.action },
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
