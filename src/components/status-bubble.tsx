import { Pressable, StyleSheet, Text } from 'react-native';

import { formatDate } from '@/lib/format';
import { firstName, type Opener } from '@/lib/opener';
import { color, font, type } from '@/theme';

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h`;
  if (m < 7 * 24 * 60) return `${Math.round(m / 1440)}d`;
  return formatDate(iso);
}

/**
 * The profile's one message from "AI <first name>" (owner, Nov 4): the AI "lately" line, or a members' greeting. A chat
 * bubble with no avatar (the portrait is right above it); tapping it opens the chat with this message at the top.
 */
export function StatusBubble({ name, opener, at, onPress }: { name: string; opener: Opener; at?: string; onPress: () => void }) {
  const who = `AI ${firstName(name)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${who}: ${opener.text}${at ? `. Written ${ago(at)} ago` : ''}.`}
      accessibilityHint="Opens the chat to reply"
      onPress={onPress}
      style={({ pressed }) => [styles.bubble, pressed && { opacity: 0.75 }]}>
      <Text style={styles.meta} numberOfLines={1}>
        {who}
        {at ? ` · ${ago(at)}` : ''}
      </Text>
      <Text style={styles.text}>{opener.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  meta: { fontFamily: font.semibold, fontSize: 12, color: color.textSecondary },
  text: { ...type.body, color: color.text },
});
