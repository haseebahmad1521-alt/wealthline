// Profile: what moves this fortune. Recorded listed stakes × each company's measured sensitivities (a 10% rise in
// global stocks, oil, Chinese stocks or the dollar), a typical month's swing, and where those companies earn.
import { StyleSheet, Text, View } from 'react-native';

import covariance from '@/data/covariance.json';
import { Glass } from '@/components/glass';
import { Caption, Heading, Icon, icons } from '@/components/ui';
import { useMoney } from '@/lib/currency';
import { drivers, revenuePlaces, typicalMonth, type Driver } from '@/lib/drivers';
import type { Covariance } from '@/lib/races';
import { useSimData } from '@/lib/scenarios';
import { useWorld } from '@/lib/world';
import { color, space, type } from '@/theme';

const LABEL: Record<Driver['factor'], string> = {
  market: 'Global stocks rise 10%',
  oil: 'Oil rises 10%',
  china: 'Chinese stocks rise 10%',
  usd: 'The dollar rises 10%',
};

export function FortuneDrivers({ personId, netWorth }: { personId: string; netWorth: number | null }) {
  const world = useWorld();
  const sim = useSimData();
  const money = useMoney();
  const empire = world.data?.find((e) => e.person.id === personId);
  if (!empire || !sim.data) return null;
  const stakes = empire.stakes.filter((s) => s.value && s.value > 0).map((s) => ({ companyId: s.company.id, value: s.value! }));
  if (!stakes.length) return null;
  const { drivers: list, measured } = drivers(stakes, sim.data.fits);
  if (!measured) return null;
  const month = typicalMonth(stakes, covariance as Covariance);
  // The World Bank's list leaves out a few places companies report on their own.
  const names = new Map([['TW', 'Taiwan'], ['HK', 'Hong Kong'], ['MO', 'Macau'], ...(world.countries ?? []).map((c) => [c.iso2, c.name] as [string, string])]);
  const regions = new Map(empire.companies.map((c) => [c.id, c.regions]));
  const places = revenuePlaces(stakes, (id) => regions.get(id) ?? [], (iso) => names.get(iso) ?? iso);
  const ofFortune = (d: number) => (netWorth ? ` (${((Math.abs(d) / netWorth) * 100).toFixed(1)}% of the fortune)` : '');
  return (
    <>
      <Heading level={2}>What moves this fortune.</Heading>
      <Glass style={styles.list}>
        {list.map((d, i) => {
          const up = d.dollars >= 0;
          return (
            <View
              key={d.factor}
              style={[styles.row, i > 0 && styles.sep]}
              accessible
              accessibilityLabel={`If ${LABEL[d.factor].toLowerCase()}: recorded stakes ${up ? 'gain' : 'lose'} about ${money.format(Math.abs(d.dollars))}${ofFortune(d.dollars)}`}>
              <Text style={[type.body, styles.flex, { color: color.text }]}>{LABEL[d.factor]}</Text>
              <Icon name={up ? icons.up : icons.down} size={13} tint={up ? color.gain : color.loss} />
              <Text style={[type.headline, { color: up ? color.gain : color.loss, fontSize: 15, fontVariant: ['tabular-nums'] }]}>≈{money.format(Math.abs(d.dollars))}</Text>
            </View>
          );
        })}
        {month != null && (
          <View style={[styles.row, styles.sep]}>
            <Text style={[type.body, styles.flex, { color: color.text }]}>A typical month</Text>
            <Text style={[type.headline, { color: color.text, fontSize: 15, fontVariant: ['tabular-nums'] }]}>within ±{money.format(month)}</Text>
          </View>
        )}
      </Glass>
      {places.length > 0 && (
        <Caption>
          Where those companies earn: {places.map((p) => `${p.place} ${Math.round(p.share * 100)}%`).join(' · ')}.
        </Caption>
      )}
      <Caption>
        From recorded listed stakes worth {money.format(measured)}
        {netWorth ? `, ${Math.round((measured / netWorth) * 100)}% of the estimated fortune` : ''}, and each company’s measured sensitivity to each force (weekly prices, recent years weighted more), including how the forces tend to move together. Other assets are held still. “A typical month” is the range four months in five fell within, measured over the last three years. Revenue by place from company reports, weighted by stake. Not a forecast or advice.
      </Caption>
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.md, paddingVertical: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  flex: { flex: 1, minWidth: 0 },
});
