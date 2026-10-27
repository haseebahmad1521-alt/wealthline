import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CITIES, REGION_LABEL, targetFor, type City, type Region } from '../data/cities';
import { OUTFIT_LABEL, makeOutfit, namesFor, type Outfit, type OutfitKind } from '../data/players';
import { GullyCanvas } from '../three/GullyCanvas';
import { bunting, colors } from '../theme';

export interface Setup {
  city: City;
  overs: number;
  batterName: string;
  batterOutfit: Outfit;
}

interface Props {
  initial?: Setup;
  best: Record<string, number>;
  onPlay: (s: Setup) => void;
}

const REGIONS: Region[] = ['pakistan', 'india', 'neutral'];
const OUTFITS: OutfitKind[] = ['shalwar', 'pantshirt', 'kurta', 'tshirt'];
const OVERS = [1, 2, 3];

const randomName = (region: Region) => {
  const pool = namesFor(region);
  return pool[Math.floor(Math.random() * pool.length)];
};

function Bunting() {
  return (
    <View style={styles.bunting} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 18 }, (_, i) => (
        <View key={i} style={[styles.flag, { borderTopColor: bunting[i % bunting.length] }]} />
      ))}
    </View>
  );
}

export function HomeScreen({ initial, best, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState<Region>(initial?.city.region ?? 'pakistan');
  const [city, setCity] = useState<City>(initial?.city ?? CITIES[0]);
  const [name, setName] = useState(initial?.batterName ?? randomName(region));
  const [outfit, setOutfit] = useState<Outfit>(initial?.batterOutfit ?? makeOutfit('shalwar'));
  const [overs, setOvers] = useState(initial?.overs ?? 2);
  const bowlerPreview = useMemo(() => makeOutfit('shalwar'), []);

  const cities = CITIES.filter((c) => c.region === region);

  const chooseRegion = (r: Region) => {
    setRegion(r);
    const first = CITIES.find((c) => c.region === r)!;
    setCity(first);
    setName(randomName(r));
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <GullyCanvas city={city} batterOutfit={outfit} bowlerOutfit={bowlerPreview} />
        <View style={[styles.heroText, { paddingTop: insets.top + 12 }]} pointerEvents="none">
          <Text style={styles.kicker}>Tape ball · street rules</Text>
          <Text style={styles.title}>Gully Cricket</Text>
          <Text style={styles.subtitle}>{city.area}</Text>
        </View>
      </View>
      <Bunting />

      <ScrollView style={styles.panel} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120, gap: 18 }}>
        <View>
          <Text style={styles.section}>Choose your gully.</Text>
          <View style={styles.segment} accessibilityRole="tablist">
            {REGIONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => chooseRegion(r)}
                accessibilityRole="tab"
                accessibilityState={{ selected: r === region }}
                style={[styles.segBtn, r === region && styles.segBtnOn]}
              >
                <Text style={[styles.segText, r === region && styles.segTextOn]}>{REGION_LABEL[r]}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 12 }}>
            {cities.map((c) => {
              const on = c.id === city.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCity(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.name}, ${c.area}. Difficulty ${c.difficulty} of 3.`}
                  style={[styles.cityCard, { borderColor: on ? colors.red : 'transparent' }]}
                >
                  <View style={[styles.cityStripe, { backgroundColor: c.palette.walls[0] }]}>
                    {c.palette.walls.slice(1, 4).map((w) => (
                      <View key={w} style={[styles.cityChip, { backgroundColor: w }]} />
                    ))}
                  </View>
                  <Text style={styles.cityName}>{c.name}</Text>
                  <Text style={styles.cityArea} numberOfLines={1}>{c.area}</Text>
                  <Text style={styles.cityTag} numberOfLines={2}>{c.tagline}</Text>
                  <View style={styles.cityMeta}>
                    <Text style={styles.cityStars}>{'●'.repeat(c.difficulty)}{'○'.repeat(3 - c.difficulty)}</Text>
                    <Text style={styles.cityBest}>{best[c.id] !== undefined ? `Best ${best[c.id]}` : 'New'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Your batter.</Text>
          <View style={styles.nameRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={14}
              style={styles.nameInput}
              accessibilityLabel="Batter name"
              placeholder="Name"
              placeholderTextColor={colors.inkSoft}
            />
            <Pressable onPress={() => setName(randomName(region))} style={styles.shuffle} accessibilityRole="button" accessibilityLabel="Random name">
              <Text style={styles.shuffleText}>🎲 Random</Text>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {OUTFITS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setOutfit(makeOutfit(k))}
                accessibilityRole="button"
                accessibilityState={{ selected: outfit.kind === k }}
                style={[styles.chip, outfit.kind === k && styles.chipOn]}
              >
                <Text style={[styles.chipText, outfit.kind === k && styles.chipTextOn]}>{OUTFIT_LABEL[k]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Overs</Text>
          <View style={styles.chips}>
            {OVERS.map((o) => (
              <Pressable
                key={o}
                onPress={() => setOvers(o)}
                accessibilityRole="button"
                accessibilityState={{ selected: overs === o }}
                style={[styles.chip, overs === o && styles.chipOn]}
              >
                <Text style={[styles.chipText, overs === o && styles.chipTextOn]}>
                  {o} over{o > 1 ? 's' : ''} · chase {targetFor(city, o)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Gully rules.</Text>
          {[
            'Neeche = safe ground shot, up to 4.',
            'Uthao! = lofted, can go for 6 — or get you out.',
            "Ball in Uncle's house? OUT.",
            'One tip, one hand off the wall? OUT.',
            '3 wickets, no LBW, wide = 1 run.',
          ].map((r) => (
            <Text key={r} style={styles.rule}>•  {r}</Text>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.playBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={() => onPlay({ city, overs, batterName: name.trim() || randomName(region), batterOutfit: outfit })}
          accessibilityRole="button"
          accessibilityLabel={`Play in ${city.name}`}
          style={({ pressed }) => [styles.play, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <Text style={styles.playText}>Khelo! · {city.name}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 330, overflow: 'hidden', backgroundColor: '#3E87D8' },
  heroText: { paddingHorizontal: 20 },
  kicker: {
    alignSelf: 'flex-start',
    color: colors.ink,
    backgroundColor: colors.yellow,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  title: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bunting: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.bg, paddingHorizontal: 4 },
  flag: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  panel: { flex: 1 },
  section: { fontSize: 22, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 },
  segment: { flexDirection: 'row', backgroundColor: '#F1E2C6', borderRadius: 16, padding: 4, marginTop: 10 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  segText: { fontWeight: '800', color: colors.inkSoft, fontSize: 15 },
  segTextOn: { color: colors.ink },
  cityCard: {
    width: 200,
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 12,
    borderWidth: 3,
    shadowColor: '#5B3A1E',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cityStripe: { height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 8 },
  cityChip: { width: 18, height: 22, borderRadius: 4 },
  cityName: { fontSize: 20, fontWeight: '900', color: colors.ink, marginTop: 8, letterSpacing: -0.4 },
  cityArea: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  cityTag: { fontSize: 12, color: colors.inkSoft, marginTop: 4, minHeight: 32 },
  cityMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cityStars: { color: colors.red, fontWeight: '900' },
  cityBest: { color: colors.green, fontWeight: '800', fontSize: 12 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 16, gap: 10 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#FBF3E4',
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  shuffle: { minHeight: 48, borderRadius: 14, backgroundColor: colors.yellow, paddingHorizontal: 14, justifyContent: 'center' },
  shuffleText: { fontWeight: '900', color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FBF3E4' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontWeight: '800', color: colors.ink, fontSize: 14 },
  chipTextOn: { color: '#fff' },
  label: { fontWeight: '800', color: colors.inkSoft, marginTop: 4 },
  rule: { fontSize: 15, color: colors.ink, fontWeight: '600', lineHeight: 22 },
  playBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,244,224,0.94)' },
  play: {
    minHeight: 60,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.red,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  playText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
});
