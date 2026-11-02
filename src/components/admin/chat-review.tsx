import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Caption, Heading, minTouch, StateView, Surface } from '@/components/ui';
import { db } from '@/lib/supabase';
import { color, radius, space, type } from '@/theme';

type Standing = { user_id: string; email: string; strikes: number; paused_until: string | null; on_hold: boolean; held_at: string | null; plan: string | null };
const PLANS = ['pro', 'premium', 'none'] as const;

/**
 * Chat moderation and plans (batch K2, owner's rule): accounts on hold wait here for a person's decision (lift: a fresh
 * start; keep: stays on hold, with a note), paused accounts are listed for awareness, and an admin can set a user's plan
 * by email until payments write plans themselves.
 */
export function ChatReview() {
  const standing = useQuery({
    queryKey: ['admin', 'chat-standing'],
    queryFn: async () => {
      const r = await db().rpc('admin_chat_standing');
      if (r.error) throw r.error;
      return r.data as Standing[];
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<(typeof PLANS)[number]>('pro');
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  const review = async (u: Standing, lift: boolean) => {
    setBusy(u.user_id);
    const r = await db().rpc('admin_review_hold', { p_user: u.user_id, p_lift: lift, p_note: notes[u.user_id]?.trim() || null });
    setBusy(null);
    if (r.error) return setPlanMsg(r.error.message);
    void standing.refetch();
  };
  const savePlan = async () => {
    setBusy('plan');
    const r = await db().rpc('admin_set_plan', { p_email: email, p_plan: plan === 'none' ? null : plan });
    setBusy(null);
    setPlanMsg(r.error ? r.error.message : r.data ? `Saved: ${email.trim()} is now ${plan === 'none' ? 'Free' : plan}.` : 'No account with that email.');
    if (!r.error && r.data) void standing.refetch();
  };

  return (
    <View style={styles.block}>
      <Heading level={2}>Chat review.</Heading>
      {standing.isPending || standing.error ? (
        <StateView loading={standing.isPending} error={standing.error} onRetry={() => void standing.refetch()} />
      ) : standing.data.length === 0 ? (
        <Body secondary>No accounts on hold or paused.</Body>
      ) : (
        standing.data.map((u) => (
          <Surface key={u.user_id} style={styles.card}>
            <Text style={[type.headline, { color: color.text }]}>{u.email}</Text>
            <Caption>
              {u.on_hold ? `On hold since ${u.held_at ? new Date(u.held_at).toLocaleString() : '—'}` : `Paused until ${new Date(u.paused_until!).toLocaleString()}`}
              {` · ${u.strikes} strike${u.strikes === 1 ? '' : 's'} on record · ${u.plan ?? 'Free'}`}
            </Caption>
            {u.on_hold && (
              <>
                <TextInput
                  value={notes[u.user_id] ?? ''}
                  onChangeText={(t) => setNotes((n) => ({ ...n, [u.user_id]: t }))}
                  placeholder="Note (optional)"
                  accessibilityLabel={`Review note for ${u.email}`}
                  placeholderTextColor={color.textSecondary}
                  style={styles.input}
                />
                <View style={styles.row}>
                  <Button label="Lift hold" onPress={() => void review(u, true)} loading={busy === u.user_id} />
                  <Button label="Keep on hold" variant="secondary" onPress={() => void review(u, false)} disabled={busy === u.user_id} />
                </View>
              </>
            )}
          </Surface>
        ))
      )}
      <Surface style={styles.card}>
        <Text style={[type.headline, { color: color.text }]}>Set a plan</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          accessibilityLabel="Account email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholderTextColor={color.textSecondary}
          style={styles.input}
        />
        <View style={styles.row} accessibilityRole="radiogroup">
          {PLANS.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ selected: plan === p }}
              onPress={() => setPlan(p)}
              style={[styles.chip, plan === p && styles.chipOn]}>
              <Text style={[type.headline, { color: plan === p ? color.surface : color.text }]}>{p === 'none' ? 'Free' : p[0].toUpperCase() + p.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Save plan" onPress={() => void savePlan()} disabled={!email.includes('@')} loading={busy === 'plan'} />
        {planMsg && <Caption>{planMsg}</Caption>}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  card: { padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: { minHeight: minTouch, ...type.body, color: color.text, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  chip: { minHeight: minTouch, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.action },
});
