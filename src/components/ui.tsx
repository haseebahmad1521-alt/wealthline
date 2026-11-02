import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';

import { Glass } from '@/components/glass';
import { direction, formatDate, formatTime, percent } from '@/lib/format';
import { portraitAt, portraitPx } from '@/lib/portrait';
import { useMoney } from '@/lib/currency';
import { reportScroll, scene, type CameraAngle } from '@/lib/scene';
import type { LiveStatus } from '@/lib/live';
import { color, contentWidth, desktopBreakpoint, radius, space, type } from '@/theme';

/** Platform symbol names: SF Symbols on iOS, Material Symbols on Android and web. */
export type IconName = { ios: string; android: string; web: string };
export const icons = {
  up: { ios: 'arrowtriangle.up.fill', android: 'arrow_drop_up', web: 'arrow_drop_up' },
  down: { ios: 'arrowtriangle.down.fill', android: 'arrow_drop_down', web: 'arrow_drop_down' },
  flat: { ios: 'minus', android: 'remove', web: 'remove' },
  star: { ios: 'star', android: 'star', web: 'star' },
  starFill: { ios: 'star.fill', android: 'star', web: 'star' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  link: { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' },
  rankings: { ios: 'chart.bar.fill', android: 'leaderboard', web: 'leaderboard' },
  people: { ios: 'person.2.fill', android: 'group', web: 'group' },
  projects: { ios: 'sparkles', android: 'rocket_launch', web: 'rocket_launch' },
  world: { ios: 'globe', android: 'public', web: 'public' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'tune', web: 'tune' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
} satisfies Record<string, IconName>;

export function Icon({ name, size = 16, tint = color.text }: { name: IconName; size?: number; tint?: string }) {
  return (
    <SymbolView
      name={name as SymbolViewProps['name']}
      size={size}
      tintColor={tint}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/** Scrollable page body, centered at the desktop content width. */
export function Screen({ children, scroll = true, angle = 'home' }: { children: ReactNode; scroll?: boolean; /** The planet camera's angle for this page. */ angle?: CameraAngle }) {
  const inner = <View style={styles.inner}>{children}</View>;
  // Phones on the web: room at the bottom so the last items scroll clear of the floating tab bar.
  const floatingBar = Platform.OS === 'web' && useWindowDimensions().width < desktopBreakpoint;
  const content = [styles.screenContent, floatingBar && { paddingBottom: 112 }];
  // Tabs stay mounted, each with its own scroll: when this screen comes back into view, the camera returns to its spot.
  const at = useRef({ y: 0, max: 0, viewport: 0 });
  useFocusEffect(
    useCallback(() => {
      scene.angle = angle;
      scene.invalidate?.();
      reportScroll(at.current.y, at.current.max, at.current.viewport, performance.now(), true);
    }, [angle]),
  );
  return scroll ? (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={content}
      contentInsetAdjustmentBehavior="automatic"
      // The planet's camera follows the scroll: top of the page is high in space, the bottom near the horizon.
      scrollEventThrottle={16}
      onScroll={({ nativeEvent: e }) => {
        at.current = { y: e.contentOffset.y, max: e.contentSize.height - e.layoutMeasurement.height, viewport: e.layoutMeasurement.height };
        reportScroll(at.current.y, at.current.max, at.current.viewport);
      }}>
      {inner}
    </ScrollView>
  ) : (
    <View style={[styles.screen, content]}>{inner}</View>
  );
}

/** Page and section headings. The owner's headings end in a period: pass the text with it. */
export function Heading({ children, level = 1 }: { children: string; level?: 1 | 2 }) {
  return (
    <Text accessibilityRole="header" style={level === 1 ? styles.h1 : styles.h2}>
      {children}
    </Text>
  );
}

export function Body({ children, secondary, style }: { children: ReactNode; secondary?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.body, textShadow, { color: secondary ? color.textSecondary : color.text }, style]}>{children}</Text>;
}

export function Caption({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[type.caption, textShadow, { color: color.textSecondary }, style]}>{children}</Text>;
}

/** A Liquid Glass panel over the planet scene. */
export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Glass style={style}>{children}</Glass>;
}

/** Change with a drawn direction icon and a spoken direction; color is never the only signal. */
/** `compact` shows only the percentage (narrow lists); the spoken label always carries both. */
export function Change({ delta, base, size = 15, compact }: { delta: number; base: number; size?: number; compact?: boolean }) {
  const d = direction(delta);
  const { format } = useMoney();
  const tint = delta > 0 ? color.gain : delta < 0 ? color.loss : color.textSecondary;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${d.word} ${format(Math.abs(delta))}, ${percent(delta, base)}`}>
      <Icon name={delta > 0 ? icons.up : delta < 0 ? icons.down : icons.flat} size={size + 3} tint={tint} />
      <Text style={[type.number, { color: tint, fontSize: size }]}>
        {compact ? percent(delta, base) : `${format(Math.abs(delta))} · ${percent(delta, base)}`}
      </Text>
    </View>
  );
}

const provenanceCopy: Record<LiveStatus, (at: number | null) => string> = {
  projected: (at) => `Projected from market data up to ${at ? formatTime(new Date(at)) : '—'}`,
  observed: (at) => `Observed ${at ? formatTime(new Date(at)) : ''}`,
  stale: (at) => `Estimate as of ${at ? formatDate(new Date(at)) : '—'}`,
  none: () => 'No estimate yet',
};

/** The signature move: every headline value says where it came from. */
export function Provenance({ status, at }: { status: LiveStatus; at: number | null }) {
  const live = status === 'projected' || status === 'observed';
  return (
    <View style={[styles.chip, live && styles.chipLive]}>
      {live && <View style={styles.liveDot} />}
      <Text style={[type.caption, { color: live ? color.text : color.textSecondary }]}>
        {provenanceCopy[status](at)}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  const primary = variant === 'primary';
  const fg = primary ? color.onAction : color.action;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} tint={fg} size={18} /> : null}
      <Text style={[type.headline, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Portrait({ uri, name, size, rounded }: { uri: string | null; name: string; size: number; rounded?: number }) {
  const r = rounded ?? size / 2;
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  // A display-sized thumbnail; the original only if the thumbnail can't be had.
  const [full, setFull] = useState(false);
  return uri ? (
    <Image
      source={full ? uri : portraitAt(uri, portraitPx(size))}
      onError={full ? undefined : () => setFull(true)}
      style={{ width: size, height: size, borderRadius: r, backgroundColor: color.fill }}
      contentFit="cover"
      contentPosition="top"
      accessibilityLabel={`Portrait of ${name}`}
    />
  ) : (
    <View style={[styles.initials, { width: size, height: size, borderRadius: r }]}>
      <Text style={[type.headline, { color: color.textSecondary, fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

/** Loading, error (with retry), and empty states share one quiet layout. */
export function StateView({
  loading,
  error,
  onRetry,
  empty,
}: {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: { title: string; body: string; action?: ReactNode };
}) {
  if (loading) {
    return (
      <View style={styles.state} accessibilityLabel="Loading">
        <ActivityIndicator color={color.textSecondary} />
      </View>
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return (
      <View style={styles.state}>
        <Text style={[type.headline, { color: color.text }]}>Couldn’t load this.</Text>
        <Body secondary style={styles.center}>{message}</Body>
        {onRetry && (
          <View>
            <Button label="Try again" variant="secondary" onPress={onRetry} />
          </View>
        )}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.state}>
        <Text style={[type.headline, { color: color.text }]}>{empty.title}</Text>
        <Body secondary style={styles.center}>{empty.body}</Body>
        {empty.action}
      </View>
    );
  }
  return null;
}

export const minTouch = Platform.OS === 'android' ? 48 : 44;

const headingShadow = { textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 1 } };
// Body copy that can sit straight on the planet (captions under the globe, page intros): a fainter shadow keeps it
// legible over the bright limb; on glass it's barely visible.
const textShadow = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  // Transparent so the planet scene behind every screen shows through.
  screen: { flex: 1, backgroundColor: 'transparent' },
  screenContent: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xxl },
  inner: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', gap: space.lg },
  // Headings sit straight on the planet (no glass): a soft shadow keeps them readable over the bright limb.
  h1: { ...type.display, color: color.text, marginTop: space.sm, ...headingShadow },
  h2: { ...type.title, fontSize: 22, lineHeight: 28, color: color.text, marginTop: space.md, ...headingShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  chipLive: { backgroundColor: color.gainTint },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.gain },
  button: {
    minHeight: minTouch,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
  },
  buttonPrimary: { backgroundColor: color.action },
  buttonSecondary: { backgroundColor: color.actionTint },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  initials: { backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  state: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  center: { textAlign: 'center', maxWidth: 420 },
});

