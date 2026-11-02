import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type HostInstance } from 'react-native';

import { Glass } from '@/components/glass';
import { Body, Caption, Heading, Icon, Surface, icons, minTouch } from '@/components/ui';
import type { Person } from '@/lib/data';
import { formatDate, formatTime } from '@/lib/format';
import type { Brief, BriefItem, PersonNews, XTrend } from '@/lib/types';
import { color, space, type } from '@/theme';

const disclosure = 'Headlines from public news feeds. Selection and notes by AI (Grok), from headlines only. Not financial advice.';

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

/** What X is talking about around the people we track (daily). Labels are AI-written; each post is X's own text. */
export function TrendingCard({ trends, people }: { trends: XTrend[] | undefined; people: Person[] }) {
  if (!trends?.length) return null;
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <View style={styles.section}>
      <Heading level={2}>Trending on X.</Heading>
      <Caption>{formatDate(trends[0].trend_date)} · Topics picked and labelled by AI (Grok); posts as published on X.</Caption>
      <Surface style={styles.list}>
        {trends.map((t, i) => {
          const person = t.person_id ? byId.get(t.person_id) : undefined;
          return (
            <Fragment key={t.id}>
              {i > 0 && <View style={styles.separator} />}
              <View style={styles.item}>
                {person && (
                  <Link href={`/person/${person.slug}`} style={styles.person}>
                    {person.name}
                  </Link>
                )}
                <Text style={[type.headline, styles.title]}>{t.topic}</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Post by @${t.handle} on X: ${t.post_text}`}
                  accessibilityHint="Opens the post on X"
                  onPress={() => void WebBrowser.openBrowserAsync(t.post_url)}
                  style={({ pressed }) => [styles.post, pressed && { opacity: 0.7 }]}>
                  <Body secondary>
                    <Text style={{ color: color.text }}>@{t.handle}</Text> {t.post_text}
                  </Body>
                  <Caption>X{t.posted_at ? ` · ${formatDate(t.posted_at)}, ${formatTime(t.posted_at)}` : ''}</Caption>
                </Pressable>
              </View>
            </Fragment>
          );
        })}
      </Surface>
    </View>
  );
}

type Item = BriefItem | PersonNews;
type Rect = { x: number; y: number; width: number; height: number };

const published = (item: Item) => `${item.source_name}${item.published_at ? ` · ${formatDate(item.published_at)}, ${formatTime(item.published_at)}` : ''}`;

/** A list of sourced headlines with the AI note; a headline opens a glass sheet that zooms from its row. */
export function NewsList({ items, personOf }: { items: Item[]; personOf?: (id: string | null) => Person | undefined }) {
  const [open, setOpen] = useState<{ item: Item; from: Rect | null } | null>(null);
  const rows = useRef(new Map<string, HostInstance | null>());
  const show = (item: Item) => {
    const row = rows.current.get(item.id);
    if (!row) return setOpen({ item, from: null });
    row.measureInWindow((x, y, width, height) => setOpen({ item, from: width ? { x, y, width, height } : null }));
  };
  return (
    <Surface style={styles.list}>
      {items.map((item, i) => {
        const person = personOf?.(item.person_id ?? null);
        return (
          <Fragment key={item.id}>
            {i > 0 && <View style={styles.separator} />}
            <View ref={(v) => void rows.current.set(item.id, v)} style={styles.item}>
              {person && (
                <Link href={`/person/${person.slug}`} style={styles.person}>
                  {person.name}
                </Link>
              )}
              <Pressable accessibilityRole="button" accessibilityHint="Opens the headline with its source" onPress={() => show(item)} style={styles.titleRow}>
                <Text style={[type.headline, styles.title]}>{item.title}</Text>
              </Pressable>
              {!!item.note && <Body secondary>{item.note}</Body>}
              <Caption>{published(item)}</Caption>
            </View>
          </Fragment>
        );
      })}
      {open && <NewsSheet item={open.item} from={open.from} person={personOf?.(open.item.person_id ?? null)} onClose={() => setOpen(null)} />}
    </Surface>
  );
}

/** One headline as a glass sheet over the planet. It grows out of the row it came from and shrinks back into it. */
function NewsSheet({ item, from, person, onClose }: { item: Item; from: Rect | null; person?: Person; onClose: () => void }) {
  const { width: vw, height: vh } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  const [layout, setLayout] = useState<Rect | null>(null);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
  }, []);
  useEffect(() => {
    if (layout) Animated.timing(t, { toValue: 1, duration: reduce ? 160 : 340, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [layout, reduce, t]);
  const close = () => Animated.timing(t, { toValue: 0, duration: reduce ? 120 : 240, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(onClose);

  // From the row's centre and width to the sheet's (reduced motion: a plain fade in place).
  const zoom = !reduce && from && layout;
  const dx = zoom ? from.x + from.width / 2 - (layout.x + layout.width / 2) : 0;
  const dy = zoom ? from.y + from.height / 2 - (layout.y + layout.height / 2) : 0;
  const s0 = zoom ? Math.min(from.width / layout.width, 1) : 1;
  const sheetWidth = Math.min(560, vw - space.md * 2);

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close" onPress={close} />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => !layout && setLayout(e.nativeEvent.layout)}
          accessibilityViewIsModal
          style={{
            width: sheetWidth,
            maxHeight: vh - space.xl * 2,
            opacity: t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
              { scale: t.interpolate({ inputRange: [0, 1], outputRange: [s0, 1] }) },
            ],
          }}>
          {/* A firmer tint than page glass: the sheet sits over busy text, not just the planet. */}
          <Glass style={styles.sheet} tint="rgba(16,18,26,0.9)">
            {person && (
              <Link href={`/person/${person.slug}`} onPress={onClose} style={styles.person}>
                {person.name}
              </Link>
            )}
            <Text accessibilityRole="header" style={[type.title, { color: color.text }]}>
              {item.title}
            </Text>
            {!!item.note && <Body secondary>{item.note}</Body>}
            <Caption>{published(item)}</Caption>
            <Caption>{disclosure}</Caption>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="link"
                accessibilityHint={`Opens the article on ${item.source_name}`}
                onPress={() => void WebBrowser.openBrowserAsync(item.source_url)}
                style={({ pressed }) => [styles.read, pressed && { opacity: 0.8 }]}>
                <Text style={[type.headline, { color: color.onAction }]}>Read on {item.source_name}</Text>
                <Icon name={icons.link} size={13} tint={color.onAction} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.done, pressed && { opacity: 0.7 }]}>
                <Text style={[type.headline, { color: color.action }]}>Done</Text>
              </Pressable>
            </View>
          </Glass>
        </Animated.View>
      </View>
    </Modal>
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
  post: { minHeight: minTouch, gap: 2, paddingVertical: 4 },
  // The page behind steps back: dimmed and softly blurred (web; native shows the dim only).
  backdrop: { backgroundColor: 'rgba(4,6,11,0.55)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as object,
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: space.md },
  sheet: { padding: space.lg, gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  read: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: color.action },
  done: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: space.md },
});
