// Liquid Glass on iOS/Android, for now: a dark system blur under the same tint floor the web uses, so text contrast
// matches. iOS 26's native glass (expo-glass-effect) replaces this when the native planet lands.
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, radius as radii, shadow } from '@/theme';

export function Glass({
  children,
  style,
  radius = radii.lg,
  tint = glass.tint,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tint?: string;
}) {
  return (
    <View style={[{ borderRadius: radius, ...shadow }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tint, borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
          ]}
        />
      </View>
      {children}
    </View>
  );
}
