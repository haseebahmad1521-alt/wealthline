// World simulations panel (What if → Simulate): ask a question or pick a scenario, then play it month by month. The
// globe shows the same month (world.tsx). Every figure comes from `simulate` (src/lib/simulate.ts): recorded revenue,
// GDP and stakes times the scenario's stated changes; dollar figures only where a stake is recorded.
import * as WebBrowser from 'expo-web-browser';
import { Slider } from 'heroui-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Caption, Heading, Icon, Portrait, icons, minTouch } from '@/components/ui';
import { usd } from '@/lib/format';
import type { Scenario } from '@/lib/scenarios';
import { simPct, type Frame } from '@/lib/simulate';
import { color, font, radius, space, type } from '@/theme';

const PLAUSIBLE: Record<Scenario['plausibility'], string> = { likely: 'Likely', possible: 'Possible', unlikely: 'Unlikely' };
const pct = simPct;
const open = (url: string) => void WebBrowser.openBrowserAsync(url);
const tint = (v: number) => (v > 0 ? color.gain : v < 0 ? color.loss : color.textSecondary);

function Move({ value, text }: { value: number; text: string }) {
  return (
    <View style={styles.move}>
      <Icon name={value > 0 ? icons.up : value < 0 ? icons.down : icons.flat} size={16} tint={tint(value)} />
      <Text style={[type.number, { color: tint(value), fontSize: 15 }]}>≈{text}</Text>
    </View>
  );
}

export function SimulatePanel({
  scenarios,
  scenario,
  onPick,
  onAsk,
  month,
  onMonth,
  playing,
  onPlay,
  frame,
  tracked,
}: {
  scenarios: Scenario[];
  scenario: Scenario | null;
  onPick: (s: Scenario) => void;
  onAsk: (prompt: string) => Promise<string | null>;
  month: number;
  onMonth: (m: number) => void;
  playing: boolean;
  onPlay: () => void;
  frame: Frame | null;
  tracked: number;
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
        <Pressable accessibilityRole="button" accessibilityLabel="Simulate" disabled={asking || prompt.trim().length < 8} onPress={ask} style={[styles.ask, (asking || prompt.trim().length < 8) && styles.dim]}>
          {asking ? <ActivityIndicator color={color.onAction} /> : <Icon name={icons.send} size={18} tint={color.onAction} />}
        </Pressable>
      </View>
      {asking && <Caption>Grok is reading the news and working out what this touches. This takes about half a minute.</Caption>}
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

      {scenario && frame && (
        <>
          <View style={styles.block}>
            <Text style={[type.title, { color: color.text, fontSize: 22, lineHeight: 27 }]}>{scenario.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.badge}>
                <Caption>{PLAUSIBLE[scenario.plausibility]}</Caption>
              </View>
              <Caption style={styles.flex}>{scenario.origin === 'example' ? 'Built-in example' : scenario.origin === 'daily' ? 'Grok’s judgement, from today’s news' : 'Grok’s answer to a question'}</Caption>
            </View>
            <Body secondary>{scenario.summary}</Body>
            <Caption>{scenario.reason}</Caption>
          </View>

          <View style={styles.player}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : month >= scenario.months ? 'Play again' : 'Play'}
              onPress={onPlay}
              style={styles.play}>
              <Icon name={playing ? icons.pause : month >= scenario.months ? icons.replay : icons.play} size={22} tint={color.onAction} />
            </Pressable>
            <View style={[styles.flex, styles.block]}>
              <View style={styles.rowLine}>
                <Text style={[type.headline, styles.flex, { color: color.text }]}>{month === 0 ? 'Now' : `Month ${month}`}</Text>
                <Caption>of {scenario.months}</Caption>
              </View>
              <Slider value={month} minValue={0} maxValue={scenario.months} step={1} aria-label="Month of the simulation" onChange={(v) => onMonth(Array.isArray(v) ? v[0] : v)}>
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
            </View>
          </View>

          {frame.transfers.map((t) => (
            <View key={`${t.seller.id}-${t.company.id}`} style={styles.note} accessible>
              <Body>
                {t.done ? `${t.buyer.name} has bought` : `In month ${scenario.shocks.find((s) => s.kind === 'transfer')?.to}, ${t.buyer.name} buys`} {t.seller.name}’s {t.company.name} shares for ≈{usd(t.paid)}.
              </Body>
              {t.buyerShort && <Caption>That is more than {t.buyer.name}’s recorded net worth; the deal would need outside money.</Caption>}
            </View>
          ))}

          <Heading level={2}>Fortunes.</Heading>
          {frame.people.length ? (
            <View style={styles.list}>
              {frame.people.slice(0, 8).map((p, i) => (
                <View
                  key={p.person.id}
                  style={[styles.row, i > 0 && styles.sep]}
                  accessible
                  accessibilityLabel={`${p.person.name}: ${p.delta != null ? `${p.delta < 0 ? 'down' : 'up'} about ${usd(Math.abs(p.delta))}` : `${p.via} ${p.pct! < 0 ? 'down' : 'up'} about ${pct(p.pct!)}`}, projected`}>
                  <Portrait uri={p.person.portrait_url ?? null} name={p.person.name} size={32} />
                  <View style={styles.flex}>
                    <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                      {p.person.name}
                    </Text>
                    <Caption numberOfLines={1}>{p.delta != null ? `Recorded stake · ${p.via}` : `${p.via} shares`}</Caption>
                  </View>
                  {p.delta != null ? <Move value={p.delta} text={usd(Math.abs(p.delta))} /> : <Move value={p.pct!} text={pct(p.pct!)} />}
                </View>
              ))}
            </View>
          ) : (
            <Caption>{month === 0 ? 'Press play to run it.' : 'Nothing tracked moves yet.'}</Caption>
          )}
          <Caption>
            Touches {frame.people.length} of {tracked} tracked fortunes. Dollar figures only where shares are recorded; others show their company’s share-price move.
          </Caption>

          {(() => {
            // Biggest moves first, among the top 10 before or after.
            const moved = frame.ranks
              .filter((r) => r.after !== r.before && (r.after <= 10 || r.before <= 10))
              .sort((a, b) => Math.abs(b.before - b.after) - Math.abs(a.before - a.after) || a.after - b.after)
              .slice(0, 5);
            return moved.length ? (
              <>
                <Heading level={2}>Rank changes.</Heading>
                <View style={styles.list}>
                  {moved.map((r, i) => (
                    <View key={r.person.id} style={[styles.row, i > 0 && styles.sep]} accessible accessibilityLabel={`${r.person.name}: from number ${r.before} to number ${r.after}`}>
                      <Text style={[type.number, { color: color.text, width: 34 }]}>#{r.after}</Text>
                      <Text style={[type.headline, styles.flex, { color: color.text }]} numberOfLines={1}>
                        {r.person.name}
                      </Text>
                      <Move value={r.before - r.after} text={`${Math.abs(r.before - r.after)} from #${r.before}`} />
                    </View>
                  ))}
                </View>
              </>
            ) : null;
          })()}

          {frame.companies.length > 0 && (
            <>
              <Heading level={2}>Companies.</Heading>
              <View style={styles.list}>
                {frame.companies.slice(0, 6).map((c, i) => (
                  <View key={c.company.id} style={[styles.row, i > 0 && styles.sep]} accessible>
                    <View style={styles.flex}>
                      <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                        {c.company.name}
                      </Text>
                      <Caption numberOfLines={1}>{Math.abs(c.revenueDelta) > 0.5 ? `Revenue ≈${c.revenueDelta < 0 ? '−' : '+'}${usd(Math.abs(c.revenueDelta))} a year` : 'Share price'}</Caption>
                    </View>
                    <Move value={c.price} text={pct(c.price)} />
                  </View>
                ))}
              </View>
            </>
          )}

          {scenario.assumptions.length > 0 && (
            <View style={styles.block}>
              <Text style={[type.headline, { color: color.text }]}>Assumptions</Text>
              {scenario.assumptions.map((a) => (
                <Caption key={a}>• {a}</Caption>
              ))}
            </View>
          )}
          {scenario.sources.map((s) => (
            <Pressable key={s.url} accessibilityRole="link" onPress={() => open(s.url)} style={styles.source}>
              <Caption style={{ color: color.action }} numberOfLines={1}>
                {s.label}
              </Caption>
            </Pressable>
          ))}
          <Caption>
            Hypothetical, not a forecast. The scenario’s changes are applied to recorded revenue by place (SEC filings), GDP (World Bank) and recorded share
            counts; a company’s share price is assumed to follow its revenue. Supply chains, currencies and knock-on effects aren’t modelled.
          </Caption>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  block: { gap: space.xs },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  badge: { backgroundColor: color.fill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill, backgroundColor: color.fill, paddingLeft: space.md, paddingRight: 4, minHeight: minTouch + 4 },
  // minWidth 0: web inputs otherwise keep an intrinsic width and push the button out.
  input: { flex: 1, minWidth: 0, minHeight: minTouch, fontFamily: font.regular, fontSize: 16, color: color.text },
  ask: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  pills: { gap: space.sm },
  pill: { minHeight: minTouch + 8, maxWidth: 240, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.md, backgroundColor: color.fill },
  pillOn: { backgroundColor: color.actionTint },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  play: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center' },
  note: { gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: color.fill },
  list: { marginHorizontal: -space.lg },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  move: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  source: { alignSelf: 'flex-start', minHeight: minTouch, justifyContent: 'center' },
});
