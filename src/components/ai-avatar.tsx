import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';

import { AI_CEL_FILTER } from '@/components/ai-cel-filter';
import { Icon, Portrait, icons } from '@/components/ui';
import { useCelAvatar } from '@/lib/cel-avatar';

/**
 * The portrait as the AI simulation wears it (owner, Nov 2): cel-shaded (posterized, inked edges), lightly washed
 * orange→purple, with a sparkle badge at the top right, so the chat and status lines never pass for the real person. The real, credited portrait stays
 * unfiltered in the hero. On web the look is baked once into a cached image (`useCelAvatar`); until it is ready, or if
 * the photo can't be read, the plain portrait shows under the wash.
 */
export function AiAvatar({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  const badge = Math.max(16, Math.round(size * 0.42));
  const baked = useCelAvatar(uri);
  return (
    <View accessible role="img" accessibilityLabel={`${name}, AI simulation`} style={{ width: size, height: size }}>
      <View style={[styles.clip, { width: size, height: size, borderRadius: size / 2 }]}>
        {baked ? (
          <Image source={baked} style={{ width: size, height: size }} contentFit="cover" transition={160} />
        ) : (
          <>
            <View style={Platform.OS === 'web' ? null : styles.tone}>
              <Portrait uri={uri} name={name} size={size} />
            </View>
            <View style={[StyleSheet.absoluteFill, styles.wash]} pointerEvents="none" />
            <View style={[StyleSheet.absoluteFill, styles.glow]} pointerEvents="none" />
          </>
        )}
      </View>
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2, top: -badge * 0.22, right: -badge * 0.22 }]}>
        <Icon name={icons.sparkle} size={Math.round(badge * 0.62)} tint="#FFFFFF" />
      </View>
    </View>
  );
}

const WASH = 'linear-gradient(135deg, #FF9A4D 0%, #C2569E 55%, #7B5CFF 100%)';

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // Native only: a cheap stand-in for the baked look. The wash keeps the photo's luminance, so the ink stays dark (owner: a bit weaker).
  tone: { filter: AI_CEL_FILTER } as object,
  wash: { experimental_backgroundImage: WASH, backgroundImage: WASH, mixBlendMode: 'color', opacity: 0.5 } as object,
  glow: { experimental_backgroundImage: WASH, backgroundImage: WASH, mixBlendMode: 'soft-light', opacity: 0.3 } as object,
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8A5CF6',
    experimental_backgroundImage: 'linear-gradient(135deg, #FF9A4D, #8A5CF6)',
    backgroundImage: 'linear-gradient(135deg, #FF9A4D, #8A5CF6)',
    borderWidth: 2,
    borderColor: '#10121A',
  } as object,
});
