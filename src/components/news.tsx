import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Caption, Heading, Icon, Surface, icons, minTouch } from '@/components/ui';
import type { Person } from '@/lib/data';
import { formatDate, formatTime } from '@/lib/format';
import type { Brief, BriefItem } from '@/lib/types';
import { color, space, type } from '@/theme';

const disclosure = 'Headlines from public news feeds. Selection and notes by Claude, from headlines only. Not financial advice.';

/** Today's brief on the front page. Renders nothing until a brief exists (the feature is optional). */
export function BriefCard({ brief, people }: { brief: Brief | null | undefined; people: Person[] }) {
  if (!brief) return null;
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <View style={styles.section}>
      <Heading level={2}>Today’s brief.</Heading>
      <Body>{brief.headline}</Body>
      <Caption>
        {formatDate(brief.brief_date)} · {disclosure}
      </Caption>
      {brief.brief_items.length > 0 && <NewsList items={brief.brief_items} personOf={(id) => (id ? byId.get(id) : undefined)} />}
    </View>
  );
}

/** A list of sourced headlines with Claude's note; the title opens the original article. */
export function NewsList({ items, personOf }: { items: BriefItem[]; personOf?: (id: string | null) => Person | undefined }) {
  return (
    <Surface style={styles.list}>
      {items.map((item, i) => {
        const person = personOf?.(item.person_id);
        return (
          <Fragment key={item.id}>
            {i > 0 && <View style={styles.separator} />}
            <View style={styles.item}>
              {person && (
                <Link href={`/person/${person.slug}`} style={styles.person}>
                  {person.name}
                </Link>
              )}
              <Pressable
                accessibilityRole="link"
                accessibilityHint={`Opens the article on ${item.source_name}`}
                onPress={() => void WebBrowser.openBrowserAsync(item.source_url)}
                style={styles.titleRow}>
                <Text style={[type.headline, styles.title]}>{item.title}</Text>
                <Icon name={icons.link} size={13} tint={color.textSecondary} />
              </Pressable>
              <Body secondary>{item.note}</Body>
              <Caption>
                {item.source_name}
                {item.published_at ? ` · ${formatDate(item.published_at)}, ${formatTime(item.published_at)}` : ''}
              </Caption>
            </View>
          </Fragment>
        );
      })}
    </Surface>
  );
}

export const newsDisclosure = disclosure;

const styles = StyleSheet.create({
  section: { gap: space.sm },
  list: { overflow: 'hidden', paddingVertical: space.xs },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.md },
  item: { paddingHorizontal: space.md, paddingVertical: space.md - 4, gap: 4 },
  person: { ...type.caption, color: color.action, alignSelf: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, minHeight: minTouch - 12 },
  title: { flex: 1, color: color.text },
});
