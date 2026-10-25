import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { bubblePath, TAIL } from '@/lib/bubble-path';

import { Icon, icons, minTouch } from '@/components/ui';import type { Person } from '@/lib/data';
import { formatDate } from '@/lib/format';
import type { SocialPost } from '@/lib/types';
import { color, font, space, type } from '@/theme';

const PAD = space.md;

function Shape({ w, h, tailX }: { w: number; h: number; tailX: number }) {
  if (w <= 0 || h <= 0) return null;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={bubblePath(w, h, tailX)} fill={color.surface} />
    </Svg>
  );
}

const PLATFORMS: Record<string, string> = {
  x: 'X',
  bluesky: 'Bluesky',
  threads: 'Threads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  weibo: 'Weibo',
  truth_social: 'Truth Social',
  mastodon: 'Mastodon',
};

function ago(iso: string | null) {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h`;
  if (m < 7 * 24 * 60) return `${Math.round(m / 1440)}d`;
  return formatDate(iso);
}

const LONG = 180; // characters; longer posts collapse to 4 lines and open in the large bubble

/** Latest post from where this person is most active; a profile link where the platform offers no public API. */
export function SocialBubble({ person, post, updating, tailX }: { person: Person; post: SocialPost | null | undefined; updating: boolean; tailX: number }) {
  const social = person.social;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [open, setOpen] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const box = useRef<ComponentRef<typeof Pressable>>(null);
  if (!social) return null;

  const platform = PLATFORMS[social.platform] ?? social.platform;
  const long = !!post && (post.text.length > LONG || post.text.split('\n').length > 4);
  const openUrl = (url: string) => void WebBrowser.openBrowserAsync(url);

  const header = (
    <View style={styles.header}>
      <Text style={styles.handle} numberOfLines={1}>
        {platform} · @{social.handle}
        {post?.posted_at ? ` · ${ago(post.posted_at)}` : ''}
      </Text>
      {updating && <ActivityIndicator size="small" color={color.textSecondary} accessibilityLabel="Checking for a newer post" />}
    </View>
  );
  const link = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={post?.post_url ? `Open this post on ${platform}` : `Open ${person.name}'s ${platform} profile`}
      onPress={() => openUrl(post?.post_url ?? social.url)}
      hitSlop={8}
      style={styles.link}>
      <Text style={styles.linkText}>{post?.post_url ? `View on ${platform}` : `Open ${platform}`}</Text>
      <Icon name={icons.link} size={12} tint={color.action} />
    </Pressable>
  );

  const content = (full: boolean) => (
    <>
      {header}
      {post ? (
        <Text style={styles.text} numberOfLines={full ? undefined : 4} selectable={full}>
          {post.text}
        </Text>
      ) : (
        <Text style={styles.muted}>
          {updating ? 'Looking for the latest post…' : `Posts most on ${platform}. ${platform} doesn’t let apps read posts, so open the profile to see the latest.`}
        </Text>
      )}
      <View style={styles.footer}>
        {long && !full ? <Text style={styles.more}>Show more</Text> : <View />}
        {link}
      </View>
    </>
  );

  return (
    <>
      <Pressable
        ref={box}
        disabled={!long}
        accessibilityRole={long ? 'button' : undefined}
        accessibilityHint={long ? 'Shows the whole post' : undefined}
        onPress={() => box.current?.measureInWindow((x, y, w, h) => setOpen({ x, y, w, h }))}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={[styles.bubble, open && { opacity: 0 }]}>
        <Shape w={size.w} h={size.h} tailX={tailX} />
        {content(false)}
      </Pressable>
      {open && <Expanded from={open} tailX={tailX} onClose={() => setOpen(null)}>{content(true)}</Expanded>}
    </>
  );
}

/** The same bubble grown to a readable size: it animates out of the inline bubble's exact rectangle and back. */
function Expanded({ from, tailX, onClose, children }: { from: { x: number; y: number; w: number; h: number }; tailX: number; onClose: () => void; children: ReactNode }) {
  const screen = useWindowDimensions();
  const [target, setTarget] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState(from);
  const p = useRef(new Animated.Value(0)).current;
  const w1 = Math.min(560, screen.width - 2 * space.md);
  const maxH = screen.height * 0.8;

  const to = target && { x: (screen.width - w1) / 2, y: Math.max((screen.height - target.h) / 2, space.lg), w: w1, h: target.h };
  const run = async (toValue: 0 | 1, done?: () => void) => {
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    Animated.timing(p, { toValue, duration: reduce ? 0 : 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => done?.());
  };

  useEffect(() => {
    if (!to) return;
    const id = p.addListener(({ value: k }) =>
      setRect({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k }),
    );
    void run(1);
    return () => p.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const close = () => void run(0, onClose);

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: p }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close post" />
      </Animated.View>

      {/* Measure the full post at the final width once, off-screen. */}
      {!target && (
        <View style={[styles.bubble, styles.measure, { width: w1 }]} onLayout={(e) => setTarget({ w: w1, h: Math.min(e.nativeEvent.layout.height, maxH) })}>
          {children}
        </View>
      )}

      {target && (
        <View accessibilityViewIsModal style={[styles.floating, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}>
          <Shape w={rect.w} h={rect.h} tailX={tailX} />
          <ScrollView style={{ width: w1 }} contentContainerStyle={styles.bubble} scrollEnabled={rect.w === w1}>
            {children}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Close post" onPress={close} style={styles.close}>
            <Icon name={icons.close} size={16} tint={color.textSecondary} />
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  bubble: { paddingTop: TAIL + PAD - 4, paddingHorizontal: PAD, paddingBottom: PAD - 4, gap: 6 },
  measure: { position: 'absolute', opacity: 0, left: -10_000, top: 0 },
  floating: { position: 'absolute', overflow: 'hidden', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))' } as object,
  backdrop: { backgroundColor: 'rgba(29,29,31,0.28)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingRight: minTouch - space.md },
  handle: { fontFamily: font.semibold, fontSize: 13, color: color.textSecondary, flexShrink: 1 },
  text: { ...type.body, color: color.text },
  muted: { ...type.body, color: color.textSecondary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  more: { fontFamily: font.semibold, fontSize: 14, color: color.action },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontFamily: font.medium, fontSize: 13, color: color.action },
  close: { position: 'absolute', top: TAIL + 2, right: 2, width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
