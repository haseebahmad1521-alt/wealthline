// Wall Street-style strip of the biggest recent moves. Every number is a ticker_moves observation pair; motion is
// presentation only. Pauses on hover/focus and with a visible button (WCAG 2.2.2); reduced motion shows a static row
// you scroll sideways. It floats as a frosted pill over the top of the page; put <TickerSpace /> first in the page
// so content starts below it and scrolls underneath.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { Icon, icons, minTouch, type IconName } from '@/components/ui';
import { age, type Ticker as TickerData, type TickerItem } from '@/lib/ticker';
import { useChromeHidden } from '@/lib/scene';
import { useTicker } from '@/lib/ticker-data';
import { color, contentWidth, radius, space, type } from '@/theme';

/** Scroll speed in px per second. */
const SPEED = 40;
const pause: IconName = { ios: 'pause.fill', android: 'pause', web: 'pause' };
const play: IconName = { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' };
/** Room the floating pill takes at the top of the page. */
const BAND = minTouch + space.sm * 2;

/** Keeps page content clear of the pill (Screen adds its own gap after it). iOS already insets scroll content for the
 * status bar; Android adds it here. */
export function TickerSpace() {
  const { ticker } = useTicker();
  const top = useSafeAreaInsets().top;
  if (!ticker?.items.length) return null;
  return <View style={{ height: BAND - space.lg + (Platform.OS === 'android' ? top : 0) }} />;
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

function useNow(ms = 60_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const heading = (t: TickerData) => (t.mode === 'close' ? 'At close' : `Last ${t.hours}h`);

function Move({ item, now, onFocus, onBlur }: { item: TickerItem; now: number; onFocus?: () => void; onBlur?: () => void }) {
  const up = item.changePct > 0;
  const tint = up ? color.gain : color.loss;
  const pct = `${Math.abs(item.changePct).toFixed(2)}%`;
  const when = item.basis === 'estimate' ? `est. ${age(item.asOf, now)}` : age(item.asOf, now);
  const spoken = `${item.label}, ${up ? 'up' : 'down'} ${pct}, ${item.basis === 'estimate' ? 'between estimates, ' : item.basis === 'close' ? 'at close, ' : ''}${age(item.asOf, now)} ago`;
  const body = (
    <>
      <Text style={[type.caption, styles.label]} numberOfLines={1}>{item.label}</Text>
      <Icon name={up ? icons.up : icons.down} size={16} tint={tint} />
      <Text style={[type.caption, type.number, { color: tint }]}>{pct}</Text>
      <Text style={[type.caption, { color: color.textSecondary }]}>{when}</Text>
    </>
  );
  if (item.kind !== 'person') {
    return <View accessible accessibilityLabel={spoken} style={styles.item}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={spoken}
      onPress={() => router.push(`/person/${item.key}`)}
      onFocus={onFocus}
      onBlur={onBlur}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.item, (pressed || hovered) && styles.itemOn]}>
      {body}
    </Pressable>
  );
}

export function Ticker() {
  const { ticker } = useTicker();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const hidden = useChromeHidden();
  const now = useNow();
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [viewW, setViewW] = useState(0);
  const [copyW, setCopyW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const pos = useRef(0);

  const overflow = copyW > viewW && viewW > 0;
  const running = !reduce && overflow && !userPaused && !hovered && !focused;

  useEffect(() => {
    const id = x.addListener(({ value }) => (pos.current = value));
    return () => x.removeListener(id);
  }, [x]);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    let anim: Animated.CompositeAnimation | null = null;
    const step = () => {
      const from = pos.current <= -copyW || pos.current > 0 ? 0 : pos.current;
      x.setValue(from);
      anim = Animated.timing(x, {
        toValue: -copyW,
        duration: ((copyW + from) / SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      });
      anim.start(({ finished }) => {
        if (!finished || !alive) return;
        pos.current = 0;
        step();
      });
    };
    step();
    return () => {
      alive = false;
      anim?.stop();
    };
  }, [running, copyW, x]);

  if (!ticker || !ticker.items.length) return null;

  const focus = { onFocus: () => setFocused(true), onBlur: () => setFocused(false) };
  const copy = (hidden: boolean) => (
    <View
      style={styles.copy}
      onLayout={hidden ? undefined : (e) => setCopyW(e.nativeEvent.layout.width)}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      {...(hidden ? ({ 'aria-hidden': true, inert: true } as object) : null)}>
      {ticker.items.map((item) => (
        <Move key={`${item.kind}:${item.key}`} item={item} now={now} {...focus} />
      ))}
    </View>
  );

  return (
    <View
      style={[
        styles.band,
        { paddingTop: insets.top + space.sm },
        // Tucks up and fades while you scroll down; back on scroll up. Reduced motion: a quick fade only.
        {
          opacity: hidden ? 0 : 1,
          transform: [{ translateY: hidden && !reduce ? -(insets.top + 64) : 0 }],
          transition: reduce ? 'opacity 120ms linear' : 'opacity 240ms ease, transform 320ms cubic-bezier(.2,.8,.2,1)',
        } as object,
      ]}
      pointerEvents={hidden ? 'none' : 'box-none'}
      aria-hidden={hidden}>
      <Glass radius={radius.pill} style={styles.pill}>
        <View
          style={[styles.strip, !(overflow && !reduce) && { paddingRight: space.md }]}
          accessibilityRole="summary"
          accessibilityLabel={`Biggest moves, ${heading(ticker).toLowerCase()}`}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}>
          <View style={styles.badge}>
            {ticker.mode === 'live' && <View style={styles.dot} />}
            <Text style={[type.caption, { color: color.text }]}>{heading(ticker)}</Text>
          </View>
          {reduce ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.viewport}>
              {copy(false)}
            </ScrollView>
          ) : (
            <View style={styles.viewport} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.track, { transform: [{ translateX: x }] }]}>
                {copy(false)}
                {overflow && copy(true)}
              </Animated.View>
            </View>
          )}
          {!reduce && overflow && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={userPaused ? 'Play ticker' : 'Pause ticker'}
              onPress={() => setUserPaused(!userPaused)}
              style={styles.toggle}>
              <Icon name={userPaused ? play : pause} size={16} tint={color.text} />
            </Pressable>
          )}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, zIndex: 10 },
  pill: { width: '100%', maxWidth: contentWidth, alignSelf: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', minHeight: minTouch, borderRadius: radius.pill, overflow: 'hidden' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: space.sm,
    alignSelf: 'stretch',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.hairline,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.gain },
  viewport: { flex: 1, minWidth: 0, overflow: 'hidden' }, // minWidth: web flex items otherwise grow to their content
  track: { flexDirection: 'row', alignSelf: 'flex-start' },
  copy: { flexDirection: 'row', flexShrink: 0, alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: minTouch,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.sm,
  },
  itemOn: { backgroundColor: color.fill },
  label: { color: color.text, marginRight: 2, maxWidth: 180 },
  toggle: {
    width: minTouch,
    height: minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: color.hairline,
  },
});
