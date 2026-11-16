// "Why it moved": the week's biggest share-price moves among tracked people's companies (Rankings), and a profile's
// own companies (profile, above the news), each split into what market forces explain and what was the company's own.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import snapshot from '@/data/moves.json';
import { Rise } from '@/components/arena';
import { Glass } from '@/components/glass';
import { Caption, Heading, Icon, Portrait, icons } from '@/components/ui';
import { REFERENCE } from '@/lib/factor-data';
import { formatDate } from '@/lib/format';
import { biggest, explain, FORCE, weekEnd, type Why } from '@/lib/why';
import { useMoves } from '@/lib/why-data';
import { useWorld, type Empire } from '@/lib/world';
import { color, space, type } from '@/theme';

const Z80 = REFERENCE.backtest?.ranges?.z80 ?? 1.2816;
const one = (v: number) => Math.abs(v).toFixed(1);

/** A signed amount with its direction icon, so gain or loss never rests on colour alone. */
function Signed({ v, unit, label }: { v: number; unit: string; label: string }) {
  const up = v >= 0;
  return (
    <View style={styles.signed}>
      <Text style={[type.caption, { color: color.textSecondary }]}>{label}</Text>
      <Icon name={up ? icons.up : icons.down} size={12} tint={up ? color.gain : color.loss} />
      <Text style={[type.caption, { color: up ? color.gain : color.loss, fontVariant: ['tabular-nums'] }]}>
        {one(v)}
        {unit}
      </Text>
    </View>
  );
}

const sentence = (w: Why, name: string) =>
  `${name} ${w.total >= 0 ? 'rose' : 'fell'} ${one(w.total)}%. Market forces ${w.market >= 0 ? 'pushed it up' : 'pulled it down'} ${one(w.market)} points${w.main ? `, mostly ${FORCE[w.main.factor]}` : ''}; ${w.own >= 0 ? 'up' : 'down'} ${one(w.own)} points were its own${w.unusual ? ', an unusual week for it' : ''}.`;

function Row({ w, name, person, i }: { w: Why; name: string; person: Empire['person'] | null; i: number }) {
  const up = w.total >= 0;
  const body = (
    <>
      {person && <Portrait uri={person.portrait_url ?? null} name={person.name} size={34} />}
      <View style={styles.flex}>
        <View style={styles.line}>
          <Text style={[type.headline, styles.flex, { color: color.text, fontSize: 15 }]} numberOfLines={1}>
            {name}
            {person ? <Text style={{ color: color.textSecondary, fontWeight: '400' }}> · {person.name.replace(/ & family$/, '')}</Text> : null}
          </Text>
          <Icon name={up ? icons.up : icons.down} size={14} tint={up ? color.gain : color.loss} />
          <Text style={[type.headline, { color: up ? color.gain : color.loss, fontSize: 15, fontVariant: ['tabular-nums'] }]}>{one(w.total)}%</Text>
        </View>
        <View style={styles.parts}>
          <Signed v={w.market} unit=" pts" label={w.main ? `Markets (mostly ${FORCE[w.main.factor]})` : 'Markets'} />
          <Signed v={w.own} unit=" pts" label="Its own" />
          {w.unusual && <Text style={[type.caption, { color: color.textSecondary }]}>Unusual week</Text>}
        </View>
      </View>
    </>
  );
  return (
    <Rise i={i} style={[styles.row, i > 0 && styles.sep]}>
      {person ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${sentence(w, name)} Opens ${person.name}.`} onPress={() => router.push(`/person/${person.slug}`)} style={styles.press}>
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={sentence(w, name)} style={styles.press}>
          {body}
        </View>
      )}
    </Rise>
  );
}

function Note({ week, from }: { week: string; from: 'ledger' | 'snapshot' }) {
  return (
    <Caption>
      Week to {formatDate(`${weekEnd(week)}T12:00:00Z`)}. Market forces: how global stocks, oil, Chinese stocks, the dollar and the company’s industry moved that week, times its sensitivity to each, measured on earlier weeks only. The rest is its own: its news and results, or anything those forces miss. A split of a past week, not a forecast
      {from === 'snapshot' ? `; computed from Yahoo Finance weekly closes on ${formatDate(`${snapshot.built}T12:00:00Z`)}` : ''}.
    </Caption>
  );
}

/** Each company's biggest holder among tracked people (by recorded stake value), else the first person linked to it. */
function owners(empires: Empire[]) {
  const out = new Map<string, { person: Empire['person']; name: string; value: number }>();
  for (const e of empires) {
    for (const c of e.companies) {
      const value = e.stakes.find((s) => s.company.id === c.id)?.value ?? -1;
      const had = out.get(c.id);
      if (!had || value > had.value) out.set(c.id, { person: e.person, name: c.name, value });
    }
  }
  return out;
}

/** Rankings: the week's biggest moves among tracked people's companies. */
export function WhyTheyMoved() {
  const world = useWorld();
  const moves = useMoves();
  const owned = useMemo(() => owners(world.data ?? []), [world.data]);
  const top = useMemo(() => (moves.data ? biggest(moves.data.rows.filter((r) => owned.has(r.company_id)), Z80) : []), [moves.data, owned]);
  if (!moves.data || !top.length) return null;
  return (
    <View style={styles.section}>
      <Heading level={2}>Why they moved.</Heading>
      <Caption>The week’s biggest share-price moves among the companies behind these fortunes, and how much the markets explain.</Caption>
      <Glass style={styles.list}>
        {top.map((w, i) => {
          const o = owned.get(w.companyId)!;
          return <Row key={w.companyId} w={w} name={o.name} person={o.person} i={i} />;
        })}
      </Glass>
      <Note week={moves.data.week} from={moves.data.from} />
    </View>
  );
}

/** Profile: this person's listed companies' week, above the news that may explain their own part. */
export function WhyItMoved({ personId }: { personId: string }) {
  const world = useWorld();
  const moves = useMoves();
  const empire = world.data?.find((e) => e.person.id === personId);
  const mine = useMemo(() => {
    if (!empire || !moves.data) return [];
    const names = new Map(empire.companies.map((c) => [c.id, c.name]));
    return moves.data.rows
      .filter((r) => names.has(r.company_id))
      .map((r) => ({ w: explain(r, Z80), name: names.get(r.company_id)! }))
      .sort((a, b) => Math.abs(b.w.total) - Math.abs(a.w.total))
      .slice(0, 4);
  }, [empire, moves.data]);
  if (!moves.data || !mine.length) return null;
  return (
    <>
      <Heading level={2}>Why it moved.</Heading>
      <Glass style={styles.list}>
        {mine.map((x, i) => (
          <Row key={x.w.companyId} w={x.w} name={x.name} person={null} i={i} />
        ))}
      </Glass>
      <Note week={moves.data.week} from={moves.data.from} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  list: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: 24 },
  row: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  press: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  parts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 2, marginTop: 2 },
  signed: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  flex: { flex: 1, minWidth: 0 },
});
