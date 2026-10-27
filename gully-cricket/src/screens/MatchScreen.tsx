import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { targetFor, type City } from '../data/cities';
import { OUTFIT_LABEL, makeOutfit, namesFor, randomOutfitKind, type Outfit } from '../data/players';
import {
  applyOutcome,
  ballSymbol,
  ballsLeft,
  makeDelivery,
  newMatch,
  overJustEnded,
  overText,
  resolveLeave,
  resolveShot,
  runsNeeded,
  timingHint,
  timingQuality,
  type BallOutcome,
  type MatchState,
  type Quality,
  type ShotType,
} from '../game/engine';
import { deliveryPosition, hitPlan } from '../game/flight';
import { INTRO_MS, RESULT_MS, RUNUP_MS, WAIT_MS, type Live, type Phase } from '../game/frame';
import { GullyCanvas } from '../three/GullyCanvas';
import { colors } from '../theme';

export interface MatchConfig {
  city: City;
  overs: number;
  wickets: number;
  batterName: string;
  batterOutfit: Outfit;
}

const QUALITY_LABEL: Record<Quality, string> = {
  perfect: 'PERFECT TIMING',
  good: 'Good timing',
  ok: 'Bit off',
  poor: 'Mistimed',
  miss: 'Missed',
};

function buzz(kind: 'hit' | 'big' | 'out') {
  if (Platform.OS === 'web') return;
  const style =
    kind === 'out'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : kind === 'big'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(style).catch(() => {});
}

interface Props {
  config: MatchConfig;
  onFinish: (m: MatchState) => void;
  onQuit: () => void;
}

export function MatchScreen({ config, onFinish, onQuit }: Props) {
  const { city } = config;
  const insets = useSafeAreaInsets();
  const rng = useRef(Math.random).current;
  const difficulty = useMemo(() => ({ level: city.difficulty }), [city]);

  const bowlers = useMemo(() => {
    const pool = namesFor(city.region).filter((n) => n !== config.batterName);
    const picks: { name: string; outfit: Outfit }[] = [];
    while (picks.length < 3) {
      const name = pool[Math.floor(Math.random() * pool.length)];
      if (picks.some((p) => p.name === name)) continue;
      picks.push({ name, outfit: makeOutfit(randomOutfitKind(city.region), Math.random, { region: city.region, build: 'teen' }) });
    }
    return picks;
  }, [city, config.batterName]);

  const [match, setMatch] = useState(() => newMatch(targetFor(city, config.overs), config.overs, config.wickets));
  const matchRef = useRef(match);
  matchRef.current = match;

  const live = useRef<Live>({ phase: 'intro', t0: performance.now(), delivery: makeDelivery(rng, difficulty) });
  // Expose live state on web so automated screenshots can pose the scene.
  useEffect(() => {
    if (Platform.OS === 'web') (globalThis as { __gullyLive?: unknown }).__gullyLive = live;
  }, []);
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  const uiKey = useRef('');

  const bowler = bowlers[Math.floor(match.legalBalls / 6) % bowlers.length];

  const startPhase = (phase: Phase, t: number) => {
    live.current.phase = phase;
    live.current.t0 = t;
  };

  const finishBall = useCallback(
    (o: BallOutcome, t: number) => {
      const L = live.current;
      L.outcome = o;
      startPhase('result', t);
      if (o.wicket) buzz('out');
      else if (o.runs >= 4) buzz('big');
      const next = applyOutcome(matchRef.current, o);
      matchRef.current = next;
      setMatch(next);
    },
    [],
  );

  // Main loop.
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const L = live.current;
      const el = t - L.t0;
      switch (L.phase) {
        case 'intro':
          if (el > INTRO_MS) startPhase('waiting', t);
          break;
        case 'waiting':
          if (el > WAIT_MS) startPhase('runup', t);
          break;
        case 'runup':
          if (el > RUNUP_MS) startPhase('flight', t);
          break;
        case 'flight': {
          const p = el / (L.delivery.duration * 1000);
          if (p >= 1) finishBall(resolveLeave(rng, L.delivery, L.missedAt !== undefined), t);
          break;
        }
        case 'hit':
          if (el > hitPlan(L.outcome!, L.contact!).duration * 1000) startPhase('result', t);
          break;
        case 'result': {
          if (el > RESULT_MS) {
            const m = matchRef.current;
            if (m.status !== 'playing') {
              startPhase('done', t);
              onFinish(m);
              break;
            }
            live.current = {
              phase: overJustEnded(m) ? 'intro' : 'waiting',
              t0: t,
              delivery: makeDelivery(rng, difficulty),
            };
          }
          break;
        }
      }
      const key = `${live.current.phase}|${live.current.hint ?? ''}|${live.current.t0}`;
      if (key !== uiKey.current) {
        uiKey.current = key;
        redraw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [difficulty, finishBall, onFinish, rng]);

  const swing = useCallback(
    (shot: ShotType) => {
      const L = live.current;
      if (L.phase !== 'flight' || L.swing || L.missedAt !== undefined) return;
      const t = performance.now();
      const p = (t - L.t0) / (L.delivery.duration * 1000);
      const quality = timingQuality(p, L.delivery);
      L.swing = { at: t, shot, quality };
      if (quality === 'miss') {
        L.missedAt = t;
        L.hint = timingHint(p) === 'early' ? 'Too early!' : 'Too late!';
        return;
      }
      L.hint = QUALITY_LABEL[quality];
      buzz('hit');
      const o = resolveShot(rng, L.delivery, shot, quality);
      L.contact = deliveryPosition(L.delivery, Math.min(p, 0.97));
      L.outcome = o;
      startPhase('hit', t);
      const next = applyOutcome(matchRef.current, o);
      matchRef.current = next;
      setMatch(next);
      if (o.wicket) buzz('out');
      else if (o.runs >= 4) buzz('big');
    },
    [rng],
  );

  // Keyboard on web: ← / A = ground shot, ↑ / Space / W = lofted.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ArrowDown' || e.key === 's') swing('ground');
      if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') {
        e.preventDefault();
        swing('lofted');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swing]);

  const L = live.current;

  const banner = L.phase === 'result' || L.phase === 'hit' ? L.outcome : undefined;
  const thisOver = match.log.slice(
    (() => {
      // index of first ball of the current over
      let legal = 0;
      const startLegal = Math.floor((match.legalBalls - (overJustEnded(match) && L.phase !== 'result' && L.phase !== 'hit' ? 0 : 0)) / 6) * 6;
      for (let i = 0; i < match.log.length; i++) {
        if (legal >= startLegal) return i;
        if (match.log[i].legal) legal++;
      }
      return match.log.length;
    })(),
  );
  const overDots = overJustEnded(match) && (L.phase === 'intro' || L.phase === 'waiting') ? [] : thisOver;

  const need = runsNeeded(match);
  const left = ballsLeft(match);

  return (
    <View style={styles.root}>
      <GullyCanvas city={city} batterOutfit={config.batterOutfit} bowlerOutfit={bowler.outfit} live={live} />

      {/* Scoreboard */}
      <View style={[styles.hud, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.hudRow}>
          <Pressable onPress={onQuit} accessibilityRole="button" accessibilityLabel="Quit match" style={styles.quit} hitSlop={10}>
            <Text style={styles.quitText}>✕</Text>
          </Pressable>
          <View style={styles.score} accessible accessibilityLabel={`${match.runs} for ${match.wickets}. Need ${need} from ${left} balls.`}>
            <Text style={styles.scoreMain}>
              {match.runs}/{match.wickets}
              <Text style={styles.scoreOvers}>  ({overText(match.legalBalls)}/{config.overs})</Text>
            </Text>
            <Text style={styles.scoreNeed}>
              {match.status === 'won' ? 'Target chased!' : `Need ${need} off ${left} ball${left === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={styles.city}>
            <Text style={styles.cityName}>{city.name}</Text>
            <Text style={styles.cityTarget}>Target {match.target}</Text>
          </View>
        </View>
        <View style={styles.overRow}>
          <Text style={styles.bowlerText} numberOfLines={1}>
            {bowler.name} bowling · {config.batterName} batting
          </Text>
          <View style={styles.dots}>
            {overDots.map((o, i) => (
              <View key={i} style={[styles.dot, o.wicket ? styles.dotOut : o.runs >= 4 ? styles.dotBig : !o.legal ? styles.dotWide : null]}>
                <Text style={styles.dotText}>{ballSymbol(o)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Over intro card */}
      {L.phase === 'intro' && (
        <View style={styles.centerCard} pointerEvents="none">
          <Text style={styles.introOver}>Over {Math.floor(match.legalBalls / 6) + 1}</Text>
          <Text style={styles.introBowler}>{bowler.name} ki bowling</Text>
          <Text style={styles.introSub}>in {OUTFIT_LABEL[bowler.outfit.kind].toLowerCase()} · tape ball</Text>
          {match.legalBalls === 0 && <Text style={styles.introTip}>Tap a shot when the ball reaches the glowing ring.</Text>}
        </View>
      )}

      {/* Result banner */}
      {banner && (
        <View style={styles.banner} pointerEvents="none">
          <Text
            style={[
              styles.bannerLabel,
              { color: banner.wicket ? colors.red : banner.runs >= 4 ? colors.yellow : banner.extras ? colors.blue : '#FFFFFF' },
            ]}
          >
            {banner.wicket ? '✕ ' : banner.runs > 0 ? '▲ ' : ''}
            {banner.label}
          </Text>
          <Text style={styles.bannerLine}>{banner.commentary}</Text>
        </View>
      )}

      {L.hint && (L.phase === 'flight' || L.phase === 'hit') && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>{L.hint}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPressIn={() => swing('ground')}
          accessibilityRole="button"
          accessibilityLabel="Ground shot, safer, up to four runs"
          style={({ pressed }) => [styles.btn, styles.btnGround, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnTitle}>Neeche</Text>
          <Text style={styles.btnSub}>Ground shot · up to 4</Text>
        </Pressable>
        <Pressable
          onPressIn={() => swing('lofted')}
          accessibilityRole="button"
          accessibilityLabel="Lofted shot, risky, can be six or out"
          style={({ pressed }) => [styles.btn, styles.btnLoft, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnTitle}>Uthao!</Text>
          <Text style={styles.btnSub}>Lofted · 6 or out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night, overflow: 'hidden' },
  hud: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quit: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30,20,16,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quitText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  score: {
    flex: 1,
    backgroundColor: 'rgba(30,20,16,0.78)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: colors.yellow,
  },
  scoreMain: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  scoreOvers: { color: '#FFE7B3', fontSize: 14, fontWeight: '700' },
  scoreNeed: { color: '#FFE7B3', fontSize: 13, fontWeight: '700' },
  city: {
    backgroundColor: colors.red,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  cityName: { color: '#fff', fontWeight: '900', fontSize: 15 },
  cityTarget: { color: '#FFE7B3', fontWeight: '700', fontSize: 12 },
  overRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  bowlerText: {
    flexShrink: 1,
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: 'rgba(30,20,16,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dots: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  dot: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOut: { backgroundColor: colors.red },
  dotBig: { backgroundColor: colors.yellow },
  dotWide: { backgroundColor: '#BFD7EA' },
  dotText: { fontWeight: '900', fontSize: 11, color: colors.ink },
  centerCard: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    backgroundColor: 'rgba(30,20,16,0.85)',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.yellow,
    maxWidth: '86%',
  },
  introOver: { color: colors.yellow, fontWeight: '900', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
  introBowler: { color: '#fff', fontWeight: '900', fontSize: 26, letterSpacing: -0.5, marginTop: 2 },
  introSub: { color: '#FFE7B3', fontWeight: '600', fontSize: 13, marginTop: 2 },
  introTip: { color: '#fff', fontWeight: '700', fontSize: 13, marginTop: 10, textAlign: 'center' },
  banner: { position: 'absolute', top: '24%', left: 16, right: 16, alignItems: 'center' },
  bannerLabel: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  bannerLine: {
    marginTop: 6,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(30,20,16,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  hint: { position: 'absolute', bottom: 150, alignSelf: 'center' },
  hintText: {
    color: colors.ink,
    backgroundColor: colors.yellow,
    fontWeight: '900',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 12 },
  btn: {
    flex: 1,
    minHeight: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnGround: { backgroundColor: colors.green },
  btnLoft: { backgroundColor: colors.red },
  btnPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  btnTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  btnSub: { color: '#FFF4E0', fontSize: 12, fontWeight: '700', marginTop: 2 },
});
