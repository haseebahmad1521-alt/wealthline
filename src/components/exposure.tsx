// Today's exposure on Rankings: who gains or loses most of their fortune if one of today's storylines happens. Exposure
// to hypothetical events from the World model, never a forecast or advice; each row opens its storyline's film.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import eventData from '@/data/events.json';
import { Rise } from '@/components/arena';
import { Glass } from '@/components/glass';
import { Caption, Heading, Icon, Portrait, icons } from '@/components/ui';
import type { EventData } from '@/lib/analogs';
import { briefing } from '@/lib/briefing';
import { useMoney } from '@/lib/currency';
import { exposure, type Exposed } from '@/lib/exposure';
import { REFERENCE } from '@/lib/factor-data';
import { examples, useDailyScenarios, useLiveOdds, useSimData, type Scenario } from '@/lib/scenarios';
import { toSimCountries, toSimEmpires } from '@/lib/sim-inputs';
import { hasRange, rangeText, simPct } from '@/lib/simulate';
import { useWorld } from '@/lib/world';
import { color, space, type } from '@/theme';

const PLAUSIBLE: Record<Scenario['plausibility'], string> = { likely: 'likely', possible: 'possible', unlikely: 'unlikely' };

export function Exposure() {
  const world = useWorld();
  const sim = useSimData();
  const daily = useDailyScenarios();
  const money = useMoney();
  const empires = world.data ?? [];
  const sample = !daily.data?.length;
  const source = useMemo(() => (sample ? examples(empires) : daily.data!), [sample, daily.data, empires]);
  const odds = useLiveOdds(source.map((s) => s.odds?.market).filter((x): x is string => !!x));
  const live = odds.data ?? new Map<string, number>();
  const found = useMemo(() => {
    if (!empires.length || !sim.data) return null;
    const items = briefing(source, toSimEmpires(empires, sim.data), toSimCountries(world.countries, sim.data), eventData as EventData, 5, REFERENCE.backtest?.ranges?.z80);
    return exposure(items);
  }, [source, empires, sim.data, world.countries]);
  if (!found || (!found.gain.length && !found.risk.length)) return null;

  const likelihood = (s: Scenario) => {
    const yes = s.odds ? (live.get(s.odds.market) ?? s.odds.yes) : null;
    if (yes != null) return `${Math.round(yes * 100)}% on Polymarket`;
    return s.origin === 'example' ? 'built-in example' : `${PLAUSIBLE[s.plausibility]}, by Grok’s judgement`;
  };
  const row = (x: Exposed, up: boolean, i: number) => {
    const p = x.move;
    const name = p.person.name.replace(/ & family$/, '');
    const size = p.delta != null ? money.format(Math.abs(p.delta)) : simPct(p.pct ?? 0);
    const range = hasRange(p.range) ? `likely ${rangeText(p.range, p.delta != null ? money.format : null)}` : null;
    const title = x.scenario.title.replace(/\.$/, '');
    return (
      <Rise key={`${up}:${p.person.id}`} i={i} style={[styles.row, i > 0 && styles.sep]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}: ${up ? 'gains' : 'loses'} about ${size}${p.delta == null ? ` through ${p.via}` : ''} if ${title}${range ? `, ${range}` : ''}. ${likelihood(x.scenario)}. Opens the simulation.`}
          onPress={() => router.push({ pathname: '/world', params: { view: 'whatif', sim: x.scenario.id } })}
          style={styles.press}>
          <Portrait uri={p.person.portrait_url ?? null} name={p.person.name} size={34} />
          <View style={styles.flex}>
            <View style={styles.line}>
              <Text style={[type.headline, styles.flex, { color: color.text, fontSize: 15 }]} numberOfLines={1}>
                {name}
              </Text>
              <Icon name={up ? icons.up : icons.down} size={14} tint={up ? color.gain : color.loss} />
              <Text style={[type.headline, { color: up ? color.gain : color.loss, fontSize: 15, fontVariant: ['tabular-nums'] }]}>≈{size}</Text>
            </View>
            <Caption numberOfLines={2}>
              If {title}
              {p.delta == null ? ` (${p.via}’s shares)` : ''} · {likelihood(x.scenario)}
              {range ? ` · ${range}` : ''}
            </Caption>
          </View>
        </Pressable>
      </Rise>
    );
  };
  return (
    <View style={styles.section}>
      <Heading level={2}>Today’s exposure.</Heading>
      <Caption>Who would gain or lose the most if one of {sample ? 'these example storylines' : 'today’s storylines'} happened.</Caption>
      {found.gain.length > 0 && (
        <Glass style={styles.list}>
          <Text style={[type.caption, styles.label]}>Most to gain</Text>
          {found.gain.map((x, i) => row(x, true, i))}
        </Glass>
      )}
      {found.risk.length > 0 && (
        <Glass style={styles.list}>
          <Text style={[type.caption, styles.label]}>Most at risk</Text>
          {found.risk.map((x, i) => row(x, false, i))}
        </Glass>
      )}
      <Caption>
        Exposure to hypothetical events, not a forecast and not investment advice. Each figure is what the World model does to recorded stakes if that storyline happens, with an 80% range; on past shocks it missed by about{' '}
        {Math.round((REFERENCE.backtest?.overall.improved ?? 0.09) * 100)} points per stock.
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  list: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: 24 },
  label: { color: color.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, paddingTop: space.sm, paddingHorizontal: space.md },
  row: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  press: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flex: { flex: 1, minWidth: 0 },
});
