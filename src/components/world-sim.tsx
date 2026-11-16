// World simulations (What if): ask a question or pick a scenario, then it plays on the globe like a short film.
// SimulatePanel sits under the globe (question box and scenario chips); SimOverlay sits on the globe (notifications as
// things happen, and a play bar). Every figure on the globe comes from `simulate` (src/lib/simulate.ts): recorded
// revenue, GDP and stakes times the scenario's stated changes, drawn dashed with "≈".
import * as WebBrowser from 'expo-web-browser';
import { Slider } from 'heroui-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { metal } from '@/components/arena';
import { REFERENCE } from '@/lib/factor-data';
import { Body, Caption, Icon, Portrait, icons, minTouch } from '@/components/ui';
import type { Scenario } from '@/lib/scenarios';
import { hasRange, NOTE_LIFE, rangeText, simPct, type Frame, type PersonMove, type SimEvent, type SimPerson } from '@/lib/simulate';
import { BATTLES, lastName, type Battle, type Corner } from '@/lib/versus';
import { DIALS, dialEffects, dialSummary, type DialValues } from '@/lib/dials';
import type { Guess, Score } from '@/lib/guess';
import type { BriefingItem } from '@/lib/briefing';
import type { Holding } from '@/lib/mine';
import { color, font, radius, space, type } from '@/theme';

// How the model did on real past shocks (scripts/build-factors.mjs): its typical miss against simply assuming every
// stock moves with the market, and how often outcomes landed in its ranges.
const ACCURACY = (() => {
  const b = REFERENCE.backtest;
  if (!b) return 'Ranges are 80%, from how each company’s shares have moved with stocks, oil, China, the dollar and its sector; private companies use their listed peers.';
  const cover = (b.ranges?.outOfSample.map((e) => e.coverage) ?? b.events.map((e) => e.coverage)).filter((x): x is number => x != null);
  const lo = Math.round(Math.min(...cover) * 100);
  const hi = Math.round(Math.max(...cover) * 100);
  const ranges = b.ranges
    ? `ranges are widened for fat tails, as past misses required: tested on shocks they weren’t fitted on, ${Math.round(b.ranges.pooledCoverage * 100)}% of outcomes fell inside (${lo}–${hi}% by shock; crashes run wider).`
    : `${lo}–${hi}% of outcomes fell inside the 80% ranges.`;
  return `Measured from ten years of prices. Tested on ${b.events.length} real shocks (${b.events.map((e) => e.event.split(':')[0]).join(', ')}): a typical miss of ${Math.round(b.overall.improved * 100)} points per stock, against ${Math.round(b.overall.naive * 100)} for assuming every stock follows the market; ${ranges} Private companies use their listed peers.`;
})();

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
  mode,
  onMode,
  versus,
  dials,
  score,
  challengeId,
  you,
  mostAsked = [],
  brief,
}: {
  /** Today's briefing, shown at the top of the Scenarios tab. */
  brief?: ReactNode;
  /** Questions and matches people asked most this week. */
  mostAsked?: (Scenario & { asks?: number })[];
  /** The "You" editor (what the player owns), shown under the tabs. */
  you: ReactNode;
  score: Score;
  challengeId: string | null;
  scenarios: Scenario[];
  scenario: Scenario | null;
  onPick: (s: Scenario) => void;
  onAsk: (prompt: string) => Promise<string | null>;
  mode: 'scenarios' | 'versus' | 'dials';
  onMode: (m: 'scenarios' | 'versus' | 'dials') => void;
  /** The versus picker and the dials, shown in their tabs. */
  versus: ReactNode;
  dials: ReactNode;
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
      <View accessibilityRole="tablist" style={styles.segments}>
        {(['scenarios', 'versus', 'dials'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => onMode(m)} style={[styles.segment, mode === m && styles.segmentOn]}>
            <Text style={[type.headline, { color: mode === m ? color.text : color.textSecondary }]}>{m === 'scenarios' ? 'Scenarios' : m === 'versus' ? 'Versus' : 'Dials'}</Text>
          </Pressable>
        ))}
      </View>
      {you}
      {mode === 'dials' ? dials : mode === 'versus' ? versus : (
      <>
      {brief}
      {score.played > 0 && (
        <Caption>
          ★ {score.points} points · streak {score.streak} · {score.right} of {score.played} called right
        </Caption>
      )}
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
        {scenarios.filter((s) => s.origin !== 'versus' && !mostAsked.some((m) => m.id === s.id)).map((s) => {
          const on = s.id === scenario?.id;
          return (
            <Pressable key={s.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onPick(s)} style={[styles.pill, on && styles.pillOn]}>
              <Text numberOfLines={1} style={[type.headline, { fontSize: 14, color: on ? color.action : color.text }]}>
                {s.title.replace(/\.$/, '')}
              </Text>
              <Caption style={{ fontSize: 11, color: s.id === challengeId ? '#F5C451' : undefined }}>
                {s.id === challengeId ? '★ Today’s challenge' : s.origin === 'example' ? 'Example' : PLAUSIBLE[s.plausibility]}
              </Caption>
            </Pressable>
          );
        })}
      </ScrollView>
      </>
      )}

      {mode === 'scenarios' && mostAsked.length > 0 && (
        <>
          <Text style={[type.caption, styles.rowLabel]}>Most asked this week</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            {mostAsked.map((s) => (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => onPick(s)} style={[styles.pill, s.id === scenario?.id && styles.pillOn]}>
                <Text numberOfLines={1} style={[type.headline, { fontSize: 14, color: color.text }]}>
                  {s.prompt && s.origin === 'prompt' ? s.prompt : s.title.replace(/\.$/, '')}
                </Text>
                <Caption style={{ fontSize: 11 }}>{s.asks && s.asks > 1 ? `Asked ${s.asks} times` : 'Asked this week'}</Caption>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
      {scenario && mode !== 'dials' && (mode === 'versus') === (scenario.origin === 'versus') && (
        <View style={styles.foot}>
          <Caption>
            Hypothetical, not a forecast
            {scenario.origin === 'example'
              ? ' · built-in example'
              : scenario.origin === 'versus' && !scenario.sources.length && scenario.id.startsWith('versus:')
                ? ' · your match, with the sizes stated in it'
                : ` · ${PLAUSIBLE[scenario.plausibility].toLowerCase()}, by Grok`}
            . Changes are applied to recorded revenue, GDP and share counts.{scenario.assumptions.length ? ` ${scenario.assumptions.join(' ')}` : ''}
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

/** Versus: pick two rivals (or a suggested match), the battle and who comes out ahead, then fight. */
export function VersusPicker({
  people,
  suggested,
  onFight,
  onGrok,
}: {
  people: SimPerson[];
  suggested: [SimPerson, SimPerson][];
  onFight: (a: string, b: string, battle: Battle, winner: 'a' | 'b') => string | null;
  onGrok: (a: string, b: string) => Promise<string | null>;
}) {
  const [a, setA] = useState<string | null>(suggested[0]?.[0].slug ?? null);
  const [b, setB] = useState<string | null>(suggested[0]?.[1].slug ?? null);
  const [slot, setSlot] = useState<'a' | 'b' | null>(null);
  const [battle, setBattle] = useState<Battle>('market');
  const [winner, setWinner] = useState<'a' | 'b'>('a');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pa = people.find((p) => p.slug === a) ?? null;
  const pb = people.find((p) => p.slug === b) ?? null;
  const ready = !!pa && !!pb && pa.slug !== pb.slug;
  const corner = (p: SimPerson | null, which: 'a' | 'b') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p ? `${p.name}, change` : `Pick the ${which === 'a' ? 'first' : 'second'} rival`}
      onPress={() => setSlot(slot === which ? null : which)}
      style={[styles.corner, slot === which && styles.cornerOn]}>
      {p ? <Portrait uri={p.portrait_url ?? null} name={p.name} size={52} /> : <View style={styles.empty}><Icon name={icons.plus} size={22} tint={color.textSecondary} /></View>}
      <Text style={[type.headline, styles.cornerName]} numberOfLines={1}>
        {p ? lastName(p.name) : 'Pick'}
      </Text>
    </Pressable>
  );
  return (
    <>
      <View style={styles.ring}>
        {corner(pa, 'a')}
        <Text style={[type.title, styles.vs]}>vs</Text>
        {corner(pb, 'b')}
      </View>
      {slot && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {people.map((p) => (
            <Pressable
              key={p.slug}
              accessibilityRole="button"
              accessibilityLabel={p.name}
              onPress={() => {
                if (slot === 'a') setA(p.slug);
                else setB(p.slug);
                setSlot(null);
              }}
              style={styles.pick}>
              <Portrait uri={p.portrait_url ?? null} name={p.name} size={40} />
              <Caption numberOfLines={1} style={styles.pickName}>
                {lastName(p.name)}
              </Caption>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {!slot && suggested.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {suggested.map(([x, y]) => {
            const on = x.slug === a && y.slug === b;
            return (
              <Pressable
                key={`${x.slug}-${y.slug}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setA(x.slug);
                  setB(y.slug);
                }}
                style={[styles.chipBtn, on && styles.pillOn]}>
                <Text style={[type.headline, { fontSize: 14, color: on ? color.action : color.text }]}>
                  {lastName(x.name)} vs {lastName(y.name)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.choices}>
        {BATTLES.map((x) => (
          <Pressable key={x.key} accessibilityRole="button" accessibilityState={{ selected: battle === x.key }} onPress={() => setBattle(x.key)} style={[styles.chipBtn, battle === x.key && styles.pillOn]}>
            <Text style={[type.headline, { fontSize: 14, color: battle === x.key ? color.action : color.text }]}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {ready && (
        <View style={styles.choices}>
          {(['a', 'b'] as const).map((w) => {
            const p = w === 'a' ? pa : pb;
            return (
              <Pressable key={w} accessibilityRole="button" accessibilityState={{ selected: winner === w }} onPress={() => setWinner(w)} style={[styles.chipBtn, winner === w && styles.pillOn]}>
                <Text style={[type.headline, { fontSize: 14, color: winner === w ? color.action : color.text }]}>{lastName(p!.name)} wins</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.choices}>
        <Pressable
          accessibilityRole="button"
          disabled={!ready || busy}
          onPress={() => setError(onFight(a!, b!, battle, winner))}
          style={[styles.fight, (!ready || busy) && styles.dim]}>
          <Text style={[type.headline, { color: color.onAction }]}>Fight</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!ready || busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            setError(await onGrok(a!, b!));
            setBusy(false);
          }}
          style={[styles.chipBtn, (!ready || busy) && styles.dim]}>
          {busy ? <ActivityIndicator color={color.text} /> : <Text style={[type.headline, { fontSize: 14, color: color.text }]}>Let Grok write it</Text>}
        </Pressable>
      </View>
      {busy && <Caption>Grok is looking at where their businesses really compete, about half a minute.</Caption>}
      {error && <Caption style={{ color: color.loss }}>{error}</Caption>}
    </>
  );
}

/** The sandbox: one slider per force; the globe shows where the year ends up as they move. */
export function DialsPanel({
  values,
  onChange,
  result,
  money,
  names,
  mine,
}: {
  mine?: { delta: number; pct: number } | null;
  values: DialValues;
  onChange: (v: DialValues) => void;
  result: Frame | null;
  money: (usd: number) => string;
  /** Tracked company names by sector, so a dial's effect names real companies. */
  names: Record<string, string[]>;
}) {
  const touched = DIALS.filter((d) => values[d.key]);
  // All the dials in one picture, rewritten as any of them moves.
  const summary = dialSummary(values, result, money);
  const value = (p: PersonMove) => p.delta ?? p.pct ?? 0;
  const text = (p: PersonMove) => (p.delta != null ? money(Math.abs(p.delta)) : simPct(p.pct!));
  const up = (result?.people ?? []).filter((p) => value(p) > 0).slice(0, 3);
  const down = (result?.people ?? []).filter((p) => value(p) < 0).slice(0, 3);
  return (
    <>
      {summary && (
        <View style={styles.summary} accessibilityLiveRegion="polite">
          <Text style={[type.headline, { color: color.text }]}>{summary.setup}</Text>
          <Body>{summary.overall}</Body>
          {summary.who ? <Caption>{summary.who}</Caption> : null}
          {mine && <YouLine mine={mine} money={money} />}
        </View>
      )}
      {DIALS.map((d) => {
        const v = values[d.key] ?? 0;
        return (
          <View key={d.key} style={styles.dial}>
            <Caption style={styles.dialLabel}>{d.label}</Caption>
            <View style={styles.dialHead}>
              <Text style={[type.headline, styles.flex, { color: v ? color.text : color.textSecondary }]}>{v ? d.describe(v) : 'As today'}</Text>
              {v !== 0 && (
                <Text style={[type.caption, { color: v > 0 ? color.gain : color.loss, fontVariant: ['tabular-nums'] }]}>
                  {v > 0 ? '+' : '−'}
                  {Math.abs(v)}%
                </Text>
              )}
            </View>
            {/* No fill: zero sits mid-track, so a fill from the left end would read as a change. */}
            <Slider value={v} minValue={d.min} maxValue={d.max} step={5} aria-label={d.label} onChange={(x) => onChange({ ...values, [d.key]: Array.isArray(x) ? x[0] : x })}>
              <Slider.Track>
                <Slider.Thumb aria-label={`${d.label}: ${v ? d.describe(v) : 'as today'}`} />
              </Slider.Track>
            </Slider>
            {dialEffects(d, v, names).map((line) => (
              <Caption key={line}>{line}</Caption>
            ))}
          </View>
        );
      })}
      {touched.length > 0 && (
        <>
          <View style={styles.movers}>
            {[...up.map((p) => ({ p, gain: true })), ...down.map((p) => ({ p, gain: false }))].map(({ p, gain }) => (
              <View key={p.person.id} style={styles.mover} accessible accessibilityLabel={`${p.person.name}, ${gain ? 'up' : 'down'} about ${text(p)}`}>
                <Portrait uri={p.person.portrait_url ?? null} name={p.person.name} size={32} />
                <Text style={[type.caption, { color: color.text }]} numberOfLines={1}>
                  {lastName(p.person.name)}
                </Text>
                <View style={styles.tileMove}>
                  <Icon name={gain ? icons.up : icons.down} size={16} tint={gain ? color.gain : color.loss} />
                  <Text style={[type.caption, { color: gain ? color.gain : color.loss }]}>≈{text(p)}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.choices}>
            <Pressable accessibilityRole="button" onPress={() => onChange({})} style={styles.chipBtn}>
              <Text style={[type.headline, { fontSize: 14, color: color.text }]}>Reset</Text>
            </Pressable>
          </View>
          <Caption>A year with these dials, hypothetical. Sizes follow the rules above; the globe and labels show where the year ends up.</Caption>
        </>
      )}
      {!touched.length && <Caption>Move a dial and the globe shows where the year ends up. Press play to watch it unfold.</Caption>}
    </>
  );
}

/** Versus on the globe: both rivals, their change so far, and a bar leaning toward whoever is ahead. */
function Scoreboard({ a, b, basis, lead, money }: { a: Corner; b: Corner; basis: 'fortune' | 'shares'; lead: 'a' | 'b' | null; money: (usd: number) => string }) {
  const text = (c: Corner) => (c.delta != null && basis === 'fortune' ? money(Math.abs(c.delta)) : simPct(c.pct ?? 0));
  const value = (c: Corner) => (basis === 'fortune' ? (c.delta ?? 0) : (c.pct ?? 0));
  const share = Math.min(Math.max(0.5 + (a.score - b.score) * 2, 0.08), 0.92);
  const side = (c: Corner, mine: 'a' | 'b') => (
    <View style={[styles.side, mine === 'b' && styles.sideRight]}>
      <Portrait uri={c.person.portrait_url ?? null} name={c.person.name} size={30} />
      <View style={mine === 'b' ? styles.alignEnd : null}>
        <Text style={[type.caption, { color: color.text, fontWeight: lead === mine ? '700' : '400' }]} numberOfLines={1}>
          {lastName(c.person.name)}
          {lead === mine ? ' ★' : ''}
        </Text>
        <View style={styles.tileMove}>
          <Icon name={value(c) >= 0 ? icons.up : icons.down} size={16} tint={value(c) >= 0 ? color.gain : color.loss} />
          <Text style={[type.caption, { color: value(c) >= 0 ? color.gain : color.loss, fontVariant: ['tabular-nums'] }]}>≈{text(c)}</Text>
        </View>
      </View>
    </View>
  );
  return (
    <View pointerEvents="none" style={styles.score} accessible accessibilityLabel={`${a.person.name} ${text(a)}, ${b.person.name} ${text(b)}${lead ? `; ${(lead === 'a' ? a : b).person.name} ahead` : ''}`}>
      <View style={styles.scoreRow}>
        {side(a, 'a')}
        {side(b, 'b')}
      </View>
      <View style={styles.tug}>
        <View style={[styles.tugA, { flex: share }]} />
        <View style={[styles.tugB, { flex: 1 - share }]} />
      </View>
    </View>
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
  ending,
  months,
  title,
  money,
  score,
  finalScore,
  quiet,
  guess,
  asking,
  onGuess,
  verdict,
  onShare,
  followUps,
  onContinue,
  mine,
}: {
  mine?: { delta: number; pct: number } | null;
  followUps?: { key: string; label: string }[];
  onContinue?: (key: string) => void;
  /** Shares the result; resolves to a short status ("Link copied"). */
  onShare?: () => Promise<string>;
  /** Guess before you play: the question (while `asking`), and how the answer went (on the end card). */
  guess?: Guess | null;
  asking?: boolean;
  onGuess?: (personId: string | null) => void;
  verdict?: Verdict | null;
  /** The dials: no notifications or end card while the player is setting them. */
  quiet?: boolean;
  /** Versus: the scoreboard now, and at the end. */
  score?: VersusScore | null;
  finalScore?: VersusScore | null;
  /** The last month's frame, for the end card. */
  ending: Frame | null;
  months: number;
  title: string;
  money: (usd: number) => string;
  notes: (SimEvent & { tick: number })[];
  tick: number;
  length: number;
  month: number;
  start: string | null;
  playing: boolean;
  onPlay: () => void;
  onScrub: (tick: number) => void;
}) {
  // Each notification stays up for NOTE_LIFE ticks; at most three at once (two under a scoreboard), newest last.
  const shown = notes.filter((e) => e.tick <= tick && e.tick > tick - NOTE_LIFE).slice(score ? -2 : -3);
  const done = tick >= length;
  // The end card shows once the film has finished; closing it reveals the globe, and it comes back on the next ending.
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!done) setClosed(false);
  }, [done]);
  const card = done && !closed && ending && !quiet;
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {asking && guess && onGuess ? (
        <GuessCard guess={guess} title={title} onGuess={onGuess} />
      ) : card ? (
        <EndCard
          frame={ending}
          months={months}
          start={start}
          title={title}
          money={money}
          versus={finalScore ?? null}
          verdict={verdict ?? null}
          onShare={onShare}
          followUps={followUps}
          onContinue={onContinue}
          mine={mine}
          onClose={() => setClosed(true)}
        />
      ) : (
      <View pointerEvents="none" style={styles.toasts} accessibilityLiveRegion="polite">
        {score && <Scoreboard {...score} money={money} />}
        {(quiet ? [] : shown).map((e) => (
          <Animated.View
            key={`${e.month}:${e.text}`}
            entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)}
            layout={LinearTransition.duration(200).reduceMotion(ReduceMotion.System)}
            style={styles.toast}>
            <View style={[styles.dot, { backgroundColor: TONE[e.tone] }]} />
            <Text style={[type.headline, styles.toastText]} numberOfLines={2}>
              {e.text}
            </Text>
          </Animated.View>
        ))}
      </View>
      )}
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : done ? 'Play again' : 'Play'} onPress={onPlay} style={styles.play}>
          <Icon name={playing ? icons.pause : done ? icons.replay : icons.play} size={20} tint={color.onAction} />
        </Pressable>
        <View style={styles.flex}>
          <Slider value={Math.min(tick, length)} minValue={0} maxValue={Math.max(length, 1)} step={1} aria-label="Time in the simulation" onChange={(v) => onScrub(Array.isArray(v) ? v[0] : v)}>
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb aria-label={`Time in the simulation: ${month === 0 ? 'today' : simDate(start, month)}`} />
            </Slider.Track>
          </Slider>
        </View>
        <Text style={[type.caption, styles.month]}>{month === 0 ? 'Today' : simDate(start, month)}</Text>
      </View>
    </View>
  );
}

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const short = (name: string) => name.replace(/ & family$/, '').split(' ').slice(-1)[0];

/** The picture at the end: who gained, who was hit hardest, the new top five, and the countries hit. */
function EndCard({
  frame,
  months,
  start,
  title,
  money,
  versus,
  verdict,
  onClose,
  onShare,
  followUps,
  onContinue,
  mine,
}: {
  /** What the simulation does to what the player owns. */
  mine?: { delta: number; pct: number } | null;
  /** "…and then?": follow-ups that carry the story on for another year. */
  followUps?: { key: string; label: string }[];
  onContinue?: (key: string) => void;
  onShare?: () => Promise<string>;
  verdict: Verdict | null;
  frame: Frame;
  months: number;
  start: string | null;
  title: string;
  money: (usd: number) => string;
  versus: VersusScore | null;
  onClose: () => void;
}) {
  const value = (p: PersonMove) => p.delta ?? p.pct ?? 0;
  const text = (p: PersonMove) => (p.delta != null ? money(Math.abs(p.delta)) : simPct(p.pct!));
  const up = frame.people.filter((p) => value(p) > 0).slice(0, 3);
  const down = frame.people.filter((p) => value(p) < 0).slice(0, 3);
  const top = frame.ranks.slice(0, 5);
  const hit = [...frame.fills].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4);
  return (
    <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={[styles.card, styles.cardFit]} accessibilityLabel={`${title}: the world after ${months} months`}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Caption>{simDate(start, months)} · hypothetical</Caption>
          <Text style={[type.headline, { color: color.text }]} numberOfLines={2}>
            {title.replace(/\.$/, '')}, {months} months on.
          </Text>
        </View>
        {onShare && <ShareButton onShare={onShare} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Close the summary" onPress={onClose} hitSlop={8} style={styles.close}>
          <Icon name={icons.close} size={16} tint={color.textSecondary} />
        </Pressable>
      </View>
      {/* Below the header the card scrolls, so on a short phone screen nothing ends up behind the panel. */}
      <ScrollView style={styles.cardBody} contentContainerStyle={styles.cardBodyInner} showsVerticalScrollIndicator={false}>
      {verdict && (
        <View style={[styles.verdict, { borderColor: verdict.right ? color.gain : color.loss }]} accessible>
          <Text style={[type.headline, { color: verdict.right ? color.gain : color.loss }]}>
            {verdict.right ? `You called it: ${lastName(verdict.answer.name)}.` : `It was ${lastName(verdict.answer.name)}.`}
          </Text>
          <Caption>{verdict.right ? `+${verdict.gained} points · streak ${verdict.streak}` : `You picked ${verdict.pick ? lastName(verdict.pick.name) : 'nobody'}. Streak reset.`}</Caption>
        </View>
      )}
      {mine && <YouLine mine={mine} money={money} />}
      {versus && <VersusResult score={versus} frame={frame} money={money} />}
      {!versus && [
        { label: 'Gained', people: up, tint: color.gain, icon: icons.up },
        { label: 'Hit hardest', people: down, tint: color.loss, icon: icons.down },
      ].map((row) =>
        row.people.length ? (
          <View key={row.label} style={styles.cardRow}>
            <Text style={[type.caption, styles.rowLabel, { color: row.tint }]}>{row.label}</Text>
            <View style={styles.tiles}>
              {row.people.map((p) => (
                <View key={p.person.id} style={styles.tile} accessible accessibilityLabel={`${p.person.name}, ${row.label.toLowerCase()}, about ${text(p)}`}>
                  <Portrait uri={p.person.portrait_url ?? null} name={p.person.name} size={34} />
                  <Text style={[type.caption, styles.tileName]} numberOfLines={1}>
                    {short(p.person.name)}
                  </Text>
                  <View style={styles.tileMove}>
                    <Icon name={row.icon} size={18} tint={row.tint} />
                    <Text style={[type.caption, { color: row.tint, fontVariant: ['tabular-nums'] }]}>≈{text(p)}</Text>
                  </View>
                  {hasRange(p.range) && <Text style={styles.range} numberOfLines={2}>{rangeText(p.range, p.delta != null ? money : null)}</Text>}
                </View>
              ))}
            </View>
          </View>
        ) : null,
      )}
      {!versus && (
      <View style={styles.cardRow}>
        <Text style={[type.caption, styles.rowLabel]}>Top five</Text>
        <View style={styles.tiles}>
          {top.map((r) => {
            const move = r.before - r.after;
            return (
              <View key={r.person.id} style={styles.rank} accessible accessibilityLabel={`Number ${r.after}: ${r.person.name}${move ? `, ${move > 0 ? 'up' : 'down'} ${Math.abs(move)}` : ''}`}>
                <Portrait uri={r.person.portrait_url ?? null} name={r.person.name} size={28} />
                <Text style={[type.caption, { color: color.text }]}>#{r.after}</Text>
                {move !== 0 && <Icon name={move > 0 ? icons.up : icons.down} size={18} tint={move > 0 ? color.gain : color.loss} />}
              </View>
            );
          })}
        </View>
      </View>
      )}
      {followUps && onContinue && followUps.length > 0 && (
        <View style={styles.cardRow}>
          <Text style={[type.caption, styles.rowLabel]}>…and then?</Text>
          <View style={styles.chips}>
            {followUps.map((f) => (
              <Pressable key={f.key} accessibilityRole="button" accessibilityLabel={`And then: ${f.label}`} onPress={() => onContinue(f.key)} style={styles.then}>
                <Text style={[type.caption, { color: color.text, fontWeight: '600' }]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Caption style={styles.basis}>{ACCURACY}</Caption>
      {!versus && hit.length > 0 && (
        <View style={styles.chips}>
          {hit.map((f) => (
            <View key={f.iso2} style={styles.chip}>
              <Icon name={f.pct < 0 ? icons.down : icons.up} size={18} tint={f.pct < 0 ? color.loss : color.gain} />
              <Text style={[type.caption, { color: color.text }]}>{regionName.of(f.iso2) ?? f.iso2}</Text>
            </View>
          ))}
        </View>
      )}
      </ScrollView>
    </Animated.View>
  );
}

/**
 * Today's briefing: each storyline with its odds (a prediction market's, live, when one matches; else Grok's judgement),
 * the fortunes it would lift and hit most, and a button to watch it play out.
 */
export function BriefingPanel({
  items,
  sample,
  live,
  date,
  money,
  onWatch,
}: {
  items: BriefingItem[];
  /** True while the daily briefing isn't on yet: the built-in examples stand in. */
  sample: boolean;
  live: Map<string, number>;
  date: string | null;
  money: (usd: number) => string;
  onWatch: (s: Scenario) => void;
}) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);
  const person = (p: PersonMove, up: boolean) => (
    <View key={p.person.id} style={styles.briefPerson} accessible accessibilityLabel={`${p.person.name}, ${up ? 'up' : 'down'} about ${p.delta != null ? money(Math.abs(p.delta)) : simPct(p.pct ?? 0)}`}>
      <Portrait uri={p.person.portrait_url ?? null} name={p.person.name} size={26} />
      <View style={styles.flex}>
        <Text style={[type.caption, { color: color.text }]} numberOfLines={1}>
          {lastName(p.person.name)}
        </Text>
        <Text style={[type.caption, { color: up ? color.gain : color.loss, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
          {up ? '▲' : '▼'} ≈{p.delta != null ? money(Math.abs(p.delta)) : simPct(p.pct ?? 0)}
        </Text>
      </View>
    </View>
  );
  return (
    <View style={styles.brief}>
      <View style={styles.briefHead}>
        <Text style={[type.title, { color: color.text, fontSize: 20 }]}>Today’s briefing.</Text>
        <Caption>{sample ? 'Sample' : date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : ''}</Caption>
      </View>
      {sample && <Caption>The daily briefing starts once Grok is switched on; until then these examples show how it works.</Caption>}
      {shown.map(({ scenario: s, winners, losers, ties }) => {
        const yes = s.odds ? (live.get(s.odds.market) ?? s.odds.yes) : null;
        const fresh = s.odds ? live.has(s.odds.market) : false;
        return (
          <View key={s.id} style={styles.briefItem}>
            <Text style={[type.headline, { color: color.text }]} numberOfLines={2}>
              {s.title.replace(/\.$/, '')}
            </Text>
            {s.odds && yes != null ? (
              <Pressable accessibilityRole="link" accessibilityLabel={`Prediction market: ${Math.round(yes * 100)} percent yes. ${s.odds.question}`} onPress={() => open(s.odds!.url)} style={styles.odds}>
                <View style={styles.oddsTrack}>
                  <View style={[styles.oddsFill, { width: `${Math.max(2, Math.round(yes * 100))}%` }]} />
                </View>
                <Caption style={{ color: color.text }} numberOfLines={1}>
                  {Math.round(yes * 100)}% on Polymarket{fresh ? '' : ` (${new Date(s.odds.as_of).toLocaleDateString('en', { day: 'numeric', month: 'short' })})`} · {s.odds.question}
                </Caption>
              </Pressable>
            ) : (
              <Caption>{s.origin === 'example' ? 'Built-in example' : `${PLAUSIBLE[s.plausibility]}, by Grok’s judgement; no prediction market asks this`}</Caption>
            )}
            {(winners.length > 0 || losers.length > 0) && (
              <View style={styles.briefPeople}>
                {winners.map((p) => person(p, true))}
                {losers.map((p) => person(p, false))}
              </View>
            )}
            {ties && ties.length > 0 && (
              <View style={styles.ties}>
                <Text style={[type.caption, styles.rowLabel]}>Documented ties</Text>
                {ties.map((t) => (
                  <Pressable
                    key={t.companyId}
                    accessibilityRole="link"
                    accessibilityLabel={`${t.company}: ${money(t.defense)} in US defence contracts since October 2023. Linked to ${t.owners.map((o) => o.name).join(', ')}. Opens USAspending.`}
                    onPress={() => open(t.url)}
                    style={styles.tie}>
                    <Caption style={[styles.flex, { color: color.text }]} numberOfLines={2}>
                      <Text style={{ fontWeight: '600' }}>{t.company}</Text> · {money(t.defense)} in US defence contracts since Oct 2023 ·{' '}
                      {t.owners.map((o) => o.name.replace(/ & family$/, '')).join(', ')}
                    </Caption>
                    <Icon name={icons.link} size={12} tint={color.action} />
                  </Pressable>
                ))}
                <Caption style={styles.basis}>From the public record (USAspending.gov). A tie shows a documented connection, not a claim that anyone is driving events.</Caption>
              </View>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={`Watch: ${s.title}`} onPress={() => onWatch(s)} style={styles.watch}>
              <Icon name={icons.play} size={14} tint={color.onAction} />
              <Text style={[type.caption, { color: color.onAction, fontWeight: '600' }]}>Watch</Text>
            </Pressable>
          </View>
        );
      })}
      {items.length > 3 && (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={styles.source}>
          <Caption style={{ color: color.action }}>{all ? 'Show fewer' : `Show all ${items.length}`}</Caption>
        </Pressable>
      )}
    </View>
  );
}

/** What a simulation does to what the player owns. */
function YouLine({ mine, money }: { mine: { delta: number; pct: number }; money: (usd: number) => string }) {
  const up = mine.delta >= 0;
  const tint = Math.abs(mine.delta) < 0.5 ? color.textSecondary : up ? color.gain : color.loss;
  return (
    <View style={styles.you} accessible accessibilityLabel={`You: ${up ? 'up' : 'down'} about ${money(Math.abs(mine.delta))}, ${Math.round(Math.abs(mine.pct) * 100)} percent`}>
      <Text style={[type.headline, { color: color.text }]}>You</Text>
      <View style={styles.tileMove}>
        <Icon name={up ? icons.up : icons.down} size={18} tint={tint} />
        <Text style={[type.headline, { color: tint, fontVariant: ['tabular-nums'] }]}>
          ≈{money(Math.abs(mine.delta))} ({Math.round(Math.abs(mine.pct) * 1000) / 10}%)
        </Text>
      </View>
    </View>
  );
}

/** "You": what the player owns in tracked companies, on this device only. Collapsed to one line until opened. */
export function MineEditor({ holdings, companies, onChange, money }: { holdings: Holding[]; companies: { id: string; name: string }[]; onChange: (h: Holding[]) => void; money: (usd: number) => string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState('');
  const name = (id: string) => companies.find((c) => c.id === id)?.name ?? 'A company';
  const total = holdings.reduce((n, h) => n + h.usd, 0);
  const q = query.trim().toLowerCase();
  const matches = q ? companies.filter((c) => c.name.toLowerCase().includes(q) && !holdings.some((h) => h.company === c.id)).slice(0, 6) : [];
  const usd = Number(amount.replace(/[^0-9.]/g, ''));
  const add = () => {
    if (!picked || !(usd > 0)) return;
    onChange([...holdings.filter((h) => h.company !== picked.id), { company: picked.id, usd: Math.round(usd) }]);
    setPicked(null);
    setQuery('');
    setAmount('');
  };
  return (
    <View style={styles.mine}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.mineHead}>
        <Text style={[type.headline, styles.flex, { color: color.text }]} numberOfLines={1}>
          {holdings.length ? `You: ${money(total)} in ${holdings.length} ${holdings.length === 1 ? 'company' : 'companies'}` : 'Add what you own, to see what it does to you'}
        </Text>
        <Icon name={open ? icons.close : icons.plus} size={16} tint={color.textSecondary} />
      </Pressable>
      {open && (
        <>
          {holdings.map((h) => (
            <View key={h.company} style={styles.mineRow}>
              <Text style={[type.body, styles.flex, { color: color.text }]} numberOfLines={1}>
                {name(h.company)}
              </Text>
              <Text style={[type.number, { color: color.text, fontSize: 15 }]}>{money(h.usd)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name(h.company)}`} onPress={() => onChange(holdings.filter((x) => x.company !== h.company))} hitSlop={8} style={styles.close}>
                <Icon name={icons.close} size={14} tint={color.textSecondary} />
              </Pressable>
            </View>
          ))}
          {picked ? (
            <View style={styles.inputRow}>
              <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                {picked.name}
              </Text>
              <TextInput
                accessibilityLabel={`Amount in ${picked.name}, in dollars`}
                placeholder="$ amount"
                placeholderTextColor={color.textSecondary}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                onSubmitEditing={add}
                style={styles.input}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Add" disabled={!(usd > 0)} onPress={add} style={[styles.ask, !(usd > 0) && styles.dim]}>
                <Icon name={icons.check} size={18} tint={color.onAction} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Find a company you own"
                placeholder="A company you own: Tesla, Nvidia…"
                placeholderTextColor={color.textSecondary}
                value={query}
                onChangeText={setQuery}
                style={styles.input}
              />
            </View>
          )}
          {matches.length > 0 && !picked && (
            <View style={styles.chips}>
              {matches.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => setPicked(c)} style={styles.then}>
                  <Text style={[type.caption, { color: color.text, fontWeight: '600' }]}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Caption>Kept on this device only, never sent anywhere. Each holding moves with its company in the simulation.</Caption>
        </>
      )}
    </View>
  );
}

/** Share from the end card; says what happened (shared, copied) for a moment. */
function ShareButton({ onShare }: { onShare: () => Promise<string> }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Share this result"
      onPress={async () => {
        setSaid(await onShare());
        setTimeout(() => setSaid(null), 2500);
      }}
      style={styles.share}>
      <Icon name={icons.link} size={14} tint={color.onAction} />
      <Text style={[type.caption, { color: color.onAction, fontWeight: '600' }]}>{said ?? 'Share'}</Text>
    </Pressable>
  );
}

export type Verdict = { right: boolean; answer: SimPerson; pick: SimPerson | null; gained: number; streak: number };

/** Before the film: who gains the most (or is hit hardest)? Four portraits, or skip. */
function GuessCard({ guess, title, onGuess }: { guess: Guess; title: string; onGuess: (personId: string | null) => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)} style={styles.card}>
      <Caption>{title.replace(/\.$/, '')}</Caption>
      <Text style={[type.headline, { color: color.text, fontSize: 18 }]}>{guess.question === 'gain' ? 'Who gains the most?' : guess.question === 'loss' ? 'Who is hit hardest?' : guess.question === 'money-loss' ? 'Who loses the most money?' : 'Who makes the most money?'}</Text>
      <View style={styles.guessGrid}>
        {guess.options.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Guess ${p.name}`} onPress={() => onGuess(p.id)} style={styles.guessOption}>
            <Portrait uri={p.portrait_url ?? null} name={p.name} size={44} />
            <Text style={[type.caption, { color: color.text }]} numberOfLines={1}>
              {lastName(p.name)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => onGuess(null)} style={styles.skip}>
        <Caption style={{ color: color.action }}>Skip and watch</Caption>
      </Pressable>
    </Animated.View>
  );
}

type VersusScore = { a: Corner; b: Corner; basis: 'fortune' | 'shares'; lead: 'a' | 'b' | null };

/** The end of a match: the winner, both rivals' final change, and where each now ranks. */
function VersusResult({ score, frame, money }: { score: VersusScore; frame: Frame; money: (usd: number) => string }) {
  const { a, b, basis, lead } = score;
  const rank = (c: Corner) => frame.ranks.find((r) => r.person.id === c.person.id);
  const text = (c: Corner) => (basis === 'fortune' && c.delta != null ? money(Math.abs(c.delta)) : simPct(c.pct ?? 0));
  const value = (c: Corner) => (basis === 'fortune' ? (c.delta ?? 0) : (c.pct ?? 0));
  const winner = lead ? (lead === 'a' ? a : b) : null;
  const fighter = (c: Corner, mine: 'a' | 'b') => {
    const r = rank(c);
    const won = lead === mine;
    return (
      <View style={styles.fighter}>
        <View style={[styles.crownRing, won && metal(1)]}>
          <Portrait uri={c.person.portrait_url ?? null} name={c.person.name} size={won ? 58 : 46} />
        </View>
        <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
          {lastName(c.person.name)}
        </Text>
        <View style={styles.tileMove}>
          <Icon name={value(c) >= 0 ? icons.up : icons.down} size={18} tint={value(c) >= 0 ? color.gain : color.loss} />
          <Text style={[type.caption, { color: value(c) >= 0 ? color.gain : color.loss, fontVariant: ['tabular-nums'] }]}>≈{text(c)}</Text>
        </View>
        {(() => {
          const p = frame.people.find((x) => x.person.id === c.person.id);
          return hasRange(p?.range) ? <Text style={styles.range}>{rangeText(p!.range!, basis === 'fortune' && p!.delta != null ? money : null)}</Text> : null;
        })()}
        {r && <Caption>{r.before === r.after ? `#${r.after}` : `#${r.before} → #${r.after}`}</Caption>}
      </View>
    );
  };
  return (
    <View style={styles.cardRow}>
      <Text style={[type.title, { color: color.text, fontSize: 22, textAlign: 'center' }]}>{winner ? `${lastName(winner.person.name)} wins.` : 'A draw.'}</Text>
      <View style={styles.scoreRow}>
        {fighter(a, 'a')}
        <Text style={[type.caption, styles.vsSmall]}>vs</Text>
        {fighter(b, 'b')}
      </View>
      <Caption style={{ textAlign: 'center' }}>{basis === 'fortune' ? 'Scored by share of each fortune, from recorded stakes.' : 'Scored by each main company’s share price; not everyone has recorded shares.'}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, borderRadius: radius.pill, backgroundColor: color.fill },
  segment: { minHeight: 38, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.md, borderRadius: radius.pill },
  segmentOn: { backgroundColor: color.surface },
  ring: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md },
  corner: { alignItems: 'center', gap: 4, padding: space.sm, borderRadius: radius.md, minWidth: 96 },
  cornerOn: { backgroundColor: color.actionTint },
  empty: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.textSecondary, alignItems: 'center', justifyContent: 'center' },
  cornerName: { color: color.text, maxWidth: 110 },
  vs: { color: color.textSecondary, fontSize: 20 },
  vsSmall: { color: color.textSecondary, alignSelf: 'center' },
  pick: { alignItems: 'center', gap: 2, width: 58 },
  pickName: { maxWidth: 58, textAlign: 'center' },
  chipBtn: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.fill },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fight: { minHeight: minTouch, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: color.action },
  score: { alignSelf: 'stretch', maxWidth: 360, gap: 6, padding: 10, borderRadius: 18, backgroundColor: 'rgba(14,16,24,.85)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.12)' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm },
  side: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sideRight: { flexDirection: 'row-reverse' },
  alignEnd: { alignItems: 'flex-end' },
  tug: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  tugA: { backgroundColor: color.action, borderRadius: 3 },
  tugB: { backgroundColor: '#FFB86B', borderRadius: 3 },
  fighter: { flex: 1, alignItems: 'center', gap: 3 },
  crownRing: { borderRadius: 40, padding: 3 },
  dial: { gap: 2 },
  brief: { gap: space.sm },
  ties: { gap: 4, paddingTop: 4, alignSelf: 'stretch', minWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.12)' },
  tie: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, minWidth: 0 },
  briefHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  briefItem: { gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.1)' },
  briefPeople: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  briefPerson: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  odds: { gap: 3 },
  oddsTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.12)', overflow: 'hidden' },
  oddsFill: { height: 6, borderRadius: 3, backgroundColor: color.action },
  watch: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: color.action },
  range: { ...type.caption, fontSize: 10, lineHeight: 13, color: color.textSecondary, textAlign: 'center', fontVariant: ['tabular-nums'] },
  basis: { fontSize: 10, lineHeight: 13 },
  summary: { gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(108,184,255,.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(108,184,255,.35)' },
  you: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.06)' },
  mine: { gap: 6 },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: minTouch },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  then: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: 'rgba(108,184,255,.18)' },
  share: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: color.action },
  guessGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  guessOption: { width: '24%', minHeight: minTouch, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.06)' },
  skip: { alignSelf: 'center', minHeight: minTouch, justifyContent: 'center' },
  verdict: { gap: 2, padding: 10, borderRadius: radius.md, borderWidth: 1, backgroundColor: 'rgba(255,255,255,.04)' },
  dialHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dialLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  movers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mover: { width: '31%', alignItems: 'center', gap: 2 },
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
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    gap: 10,
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(14,16,24,.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.14)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardFit: { flexShrink: 1, minHeight: 0 },
  cardBody: { flexShrink: 1, minHeight: 0 },
  cardBodyInner: { gap: 10 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.08)' },
  cardRow: { gap: 4 },
  rowLabel: { color: color.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  tileName: { color: color.text, maxWidth: '100%' },
  tileMove: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  rank: { flex: 1, alignItems: 'center', gap: 2, flexDirection: 'column' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.08)' },
});
