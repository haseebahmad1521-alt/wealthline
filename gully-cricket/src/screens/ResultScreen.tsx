import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { City } from '../data/cities';
import { ballSymbol, overText, runsNeeded, type MatchState } from '../game/engine';
import { colors } from '../theme';

interface Props {
  city: City;
  batterName: string;
  match: MatchState;
  isBest: boolean;
  onRematch: () => void;
  onHome: () => void;
}

export function ResultScreen({ city, batterName, match, isBest, onRematch, onHome }: Props) {
  const insets = useSafeAreaInsets();
  const won = match.status === 'won';
  const sr = match.legalBalls ? Math.round((match.runs / match.legalBalls) * 100) : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
      <View style={[styles.hero, { backgroundColor: won ? colors.win : colors.loss }]}>
        <Text style={styles.heroIcon}>{won ? '▲' : '▼'}</Text>
        <Text style={styles.heroTitle}>{won ? 'Jeet gaye!' : 'Haar gaye…'}</Text>
        <Text style={styles.heroSub}>
          {won
            ? `${batterName} is the hero of ${city.name}'s gully.`
            : `Short by ${runsNeeded(match)} — kal phir aana, ${batterName}.`}
        </Text>
        {isBest && <Text style={styles.best}>New best in {city.name}!</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Scorecard.</Text>
        <View style={styles.statRow}>
          <Stat label="Runs" value={`${match.runs}/${match.wickets}`} />
          <Stat label="Overs" value={overText(match.legalBalls)} />
          <Stat label="Target" value={String(match.target)} />
        </View>
        <View style={styles.statRow}>
          <Stat label="Chauke" value={String(match.fours)} />
          <Stat label="Chhakke" value={String(match.sixes)} />
          <Stat label="Strike rate" value={String(sr)} />
        </View>
        <View style={styles.log}>
          {match.log.map((o, i) => (
            <View key={i} style={[styles.ball, o.wicket ? styles.ballOut : o.runs >= 4 ? styles.ballBig : null]}>
              <Text style={[styles.ballText, o.wicket ? { color: '#fff' } : null]}>{ballSymbol(o)}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable onPress={onRematch} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.red }]}>
        <Text style={styles.btnText}>Ek aur! · Rematch</Text>
      </Pressable>
      <Pressable onPress={onHome} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.ink }]}>
        <Text style={styles.btnText}>Change gully</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { borderRadius: 28, padding: 24, alignItems: 'center' },
  heroIcon: { color: '#fff', fontSize: 28, fontWeight: '900' },
  heroTitle: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  heroSub: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  best: {
    marginTop: 12,
    backgroundColor: colors.yellow,
    color: colors.ink,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 16, gap: 12 },
  section: { fontSize: 22, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: '#FBF3E4', borderRadius: 16, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: colors.ink },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  log: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ball: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: '#FBF3E4', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  ballOut: { backgroundColor: colors.red },
  ballBig: { backgroundColor: colors.yellow },
  ballText: { fontWeight: '900', color: colors.ink },
  btn: { minHeight: 58, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 19, fontWeight: '900' },
});
