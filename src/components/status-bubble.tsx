import { StyleSheet, Text, View } from 'react-native';

import { AiAvatar } from '@/components/ai-avatar';
import type { Person } from '@/lib/data';
import { formatDate } from '@/lib/format';
import type { PersonStatus } from '@/lib/types';
import { color, font, space, type } from '@/theme';

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h`;
  if (m < 7 * 24 * 60) return `${Math.round(m / 1440)}d`;
  return formatDate(iso);
}

const first = (p: Person) => p.name.replace(/ & family$/, '').split(/\s+/)[0];

/**
 * "Lately": an AI paraphrase, in their voice, of what they've been doing (written server side from their latest posts and
 * headlines). Shown as a chat bubble from the stylised AI avatar, never as a quote and without a platform name.
 */
export function StatusBubble({ person, status }: { person: Person; status: PersonStatus | null | undefined }) {
  if (!status?.text) return null;
  return (
    <View style={styles.row}>
      <AiAvatar uri={person.portrait_url} name={first(person)} size={40} />
      <View
        accessible
        accessibilityLabel={`${first(person)}, AI simulation, lately: ${status.text}. Written ${ago(status.generated_at)} ago.`}
        style={styles.bubble}>
        <Text style={styles.meta} numberOfLines={1}>
          {first(person)} · AI simulation · {ago(status.generated_at)}
        </Text>
        <Text style={styles.text}>{status.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: 4 },
  bubble: {
    flexShrink: 1,
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
