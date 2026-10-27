import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MatchState } from './src/game/engine';
import { HomeScreen, type Setup } from './src/screens/HomeScreen';
import { MatchScreen } from './src/screens/MatchScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { colors } from './src/theme';

const BEST_KEY = 'gully-cricket:best:v1';

type Screen =
  | { name: 'home' }
  | { name: 'match'; setup: Setup; key: number }
  | { name: 'result'; setup: Setup; match: MatchState; isBest: boolean };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [lastSetup, setLastSetup] = useState<Setup>();
  const [best, setBest] = useState<Record<string, number>>({});

  useEffect(() => {
    AsyncStorage.getItem(BEST_KEY)
      .then((raw) => raw && setBest(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const play = useCallback((setup: Setup) => {
    setLastSetup(setup);
    setScreen({ name: 'match', setup, key: Date.now() });
  }, []);

  const finish = useCallback(
    (setup: Setup, match: MatchState) => {
      const prev = best[setup.city.id];
      const isBest = prev === undefined || match.runs > prev;
      if (isBest) {
        const next = { ...best, [setup.city.id]: match.runs };
        setBest(next);
        AsyncStorage.setItem(BEST_KEY, JSON.stringify(next)).catch(() => {});
      }
      setScreen({ name: 'result', setup, match, isBest });
    },
    [best],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style={screen.name === 'match' ? 'light' : 'dark'} />
      <View style={styles.outer}>
        <View style={styles.app}>
          {screen.name === 'home' && <HomeScreen initial={lastSetup} best={best} onPlay={play} />}
          {screen.name === 'match' && (
            <MatchScreen
              key={screen.key}
              config={{ ...screen.setup, wickets: 3 }}
              onFinish={(m) => finish(screen.setup, m)}
              onQuit={() => setScreen({ name: 'home' })}
            />
          )}
          {screen.name === 'result' && (
            <ResultScreen
              city={screen.setup.city}
              batterName={screen.setup.batterName}
              match={screen.match}
              isBest={screen.isBest}
              onRematch={() => play(screen.setup)}
              onHome={() => setScreen({ name: 'home' })}
            />
          )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // On desktop browsers keep a phone-width column; on phones it is full width.
  outer: { flex: 1, backgroundColor: colors.night, alignItems: 'center' },
  app: { flex: 1, width: '100%', maxWidth: 520, backgroundColor: colors.bg, overflow: 'hidden' },
});
