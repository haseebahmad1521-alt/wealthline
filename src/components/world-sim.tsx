// World simulations (What if): ask a question or pick a scenario, then it plays on the globe like a short film.
// SimulatePanel sits under the globe (question box and scenario chips); SimOverlay sits on the globe (notifications as
// things happen, and a play bar). Every figure on the globe comes from `simulate` (src/lib/simulate.ts): recorded
// revenue, GDP and stakes times the scenario's stated changes, drawn dashed with "≈".
import * as WebBrowser from 'expo-web-browser';
import { Slider } from 'heroui-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { Caption, Icon, icons, minTouch } from '@/components/ui';
import type { Scenario } from '@/lib/scenarios';
import { NOTE_LIFE, type SimEvent } from '@/lib/simulate';
import { color, font, radius, space, type } from '@/theme';

const PLAUSIBLE: Record<Scenario['plausibility'], string> = { likely: 'Likely', possible: 'Possible', unlikely: 'Unlikely' };
const open = (url: string) => void WebBrowser.openBrowserAsync(url);
const TONE = { gain: color.gain, loss: color.loss, info: color.action } as const;

/** The simulated month as a date ("Mar 2027"), counted from the scenario's day (or today). */
export function simDate(start: string | null, month: number): string {
  const d = start ? new Date(`${start}T12:00:00Z`) : new Date();
  d.setUTCMonth(d.getUTCMonth() + month);
  return d.toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function SimulatePanel({
  scenarios,
  scenario,
  onPick,
  onAsk,
}: {
  scenarios: Scenario[];
  scenario: Scenario | null;
  onPick: (s: Scenario) => void;
  onAsk: (prompt: string) => Promise<string | null>;
}) {
  const [prompt, setPrompt] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    const q = prompt.trim();
    if (q.length < 8 || asking) return;
    setAsking(true);
    setError(null);
    setError(await onAsk(q));
    setAsking(false);
  };
  const off = asking || prompt.trim().length < 8;

  return (
    <>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Ask a what-if question"
          placeholder="What if…"
          placeholderTextColor={color.textSecondary}
          value={prompt}
          onChangeText={setPrompt}
          maxLength={200}
          returnKeyType="go"
          onSubmitEditing={ask}
          editable={!asking}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Simulate" disabled={off} onPress={ask} style={[styles.ask, off && styles.dim]}>
          {asking ? <ActivityIndicator color={color.onAction} /> : <Icon name={icons.send} size={18} tint={color.onAction} />}
        </Pressable>
      </View>
      {asking && <Caption>Grok is working out what this touches, about half a minute.</Caption>}
      {error && <Caption style={{ color: color.loss }}>{error}</Caption>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityRole="tablist">
        {scenarios.map((s) => {
          const on = s.id === scenario?.id;
          return (
            <Pressable key={s.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onPick(s)} style={[styles.pill, on && styles.pillOn]}>
              <Text numberOfLines={1} style={[type.headline, { fontSize: 14, color: on ? color.action : color.text }]}>
                {s.title.replace(/\.$/, '')}
              </Text>
              <Caption style={{ fontSize: 11 }}>{s.origin === 'example' ? 'Example' : PLAUSIBLE[s.plausibility]}</Caption>
            </Pressable>
          );
        })}
      </ScrollView>

      {scenario && (
        <View style={styles.foot}>
          <Caption>
            Hypothetical, not a forecast{scenario.origin === 'example' ? ' · built-in example' : ` · ${PLAUSIBLE[scenario.plausibility].toLowerCase()}, by Grok`}. Changes are applied to recorded revenue, GDP and share
            counts.
          </Caption>
          {scenario.sources.map((s) => (
            <Pressable key={s.url} accessibilityRole="link" onPress={() => open(s.url)} style={styles.source}>
              <Caption style={{ color: color.action }} numberOfLines={1}>
                {s.label}
              </Caption>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

/** On the globe: the notifications for the last moments, newest last, and the play bar. Doesn't block globe drags. */
export function SimOverlay({
  notes,
  tick,
  length,
  month,
  start,
  playing,
  onPlay,
  onScrub,
}: {
  notes: (SimEvent & { tick: number })[];
  tick: number;
  length: number;
  month: number;
  start: string | null;
  playing: boolean;
  onPlay: () => void;
  onScrub: (tick: number) => void;
}) {
  // Each notification stays up for NOTE_LIFE ticks; at most three at once, newest last.
  const shown = notes.filter((e) => e.tick <= tick && e.tick > tick - NOTE_LIFE).slice(-3);
  const done = tick >= length;
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View pointerEvents="none" style={styles.toasts} accessibilityLiveRegion="polite">
        {shown.map((e) => (
          <Animated.View
            key={`${e.month}:${e.text}`}
            entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
            layout={LinearTransition.duration(200).reduceMotion(ReduceMotion.System)}
            style={styles.toast}>
            <View style={[styles.dot, { backgroundColor: TONE[e.tone] }]} />
            <Text style={[type.headline, styles.toastText]} numberOfLines={2}>
              {e.text}
            </Text>
          </Animated.View>
        ))}
      </View>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : done ? 'Play again' : 'Play'} onPress={onPlay} style={styles.play}>
          <Icon name={playing ? icons.pause : done ? icons.replay : icons.play} size={20} tint={color.onAction} />
        </Pressable>
        <View style={styles.flex}>
          <Slider value={Math.min(tick, length)} minValue={0} maxValue={Math.max(length, 1)} step={1} aria-label="Time in the simulation" onChange={(v) => onScrub(Array.isArray(v) ? v[0] : v)}>
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </View>
        <Text style={[type.caption, styles.month]}>{month === 0 ? 'Today' : simDate(start, month)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill, backgroundColor: color.fill, paddingLeft: space.md, paddingRight: 4, minHeight: minTouch + 4 },
  // minWidth 0: web inputs otherwise keep an intrinsic width and push the button out.
  input: { flex: 1, minWidth: 0, minHeight: minTouch, fontFamily: font.regular, fontSize: 16, color: color.text },
  ask: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  pills: { gap: space.sm },
  pill: { minHeight: minTouch + 8, maxWidth: 240, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md, backgroundColor: color.fill },
  pillOn: { backgroundColor: color.actionTint },
  foot: { gap: 2 },
  source: { alignSelf: 'flex-start', minHeight: minTouch, justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between', padding: space.sm, zIndex: 5 },
  toasts: { gap: 6, alignItems: 'flex-start' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 300,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,16,24,.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.12)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  toastText: { color: color.text, fontSize: 13, lineHeight: 17, flexShrink: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch', paddingRight: 52 /* clear of the zoom buttons */ },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center' },
  month: { color: color.text, minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
  flex: { flex: 1, minWidth: 0 },
});
