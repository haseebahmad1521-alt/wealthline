// iOS/Android, until the native planet (expo-gl + three) lands: plain deep space behind the glass.
import { StyleSheet, View } from 'react-native';

import { color } from '@/theme';

export function PlanetScene() {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]} pointerEvents="none" />;
}
