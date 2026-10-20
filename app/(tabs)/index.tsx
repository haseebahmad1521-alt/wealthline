import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react-native';
import { usePeople } from '@/lib/wealthline';
import { colors, money } from '@/lib/wealthline-theme';
import {
  Page,
  Type,
  Panel,
  Avatar,
  Delta,
  Stamp,
  FortuneCard,
  SectionTitle,
  PersonRow,
  DataState,
  Action,
} from '@/components/wealthline-ui';
import { Button } from 'heroui-native';

export default function Home() {
  const people = usePeople();
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const data = people.data ?? [];
  const featured = data.find((p) => p.rank === 1);
  const movers = [
    ...data
      .filter((p) => p.name && p.change != null && p.change > 0)
      .sort((a, b) => b.change! - a.change!)
      .slice(0, 3),
    ...data
      .filter((p) => p.change != null && p.change < 0)
      .sort((a, b) => a.change! - b.change!)
      .slice(0, 1),
  ];
  return (
    <Page>
      <View
        style={{
          paddingTop: desktop ? 64 : 42,
          paddingBottom: desktop ? 48 : 34,
          alignItems: 'center',
        }}
      >
        <Type
          weight="bold"
          style={{
            fontSize: desktop ? 64 : 38,
            lineHeight: desktop ? 70 : 44,
            letterSpacing: desktop ? -2.24 : -1.33,
            textAlign: 'center',
          }}
        >
          The world’s biggest fortunes.{desktop ? '\n' : ' '}In motion.
        </Type>
        <View style={{ marginTop: 23, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.muted }} />
          <Type style={{ fontSize: 12, color: colors.muted }}>20 fortunes. One clear picture.</Type>
        </View>
      </View>
      <DataState
        loading={people.isPending}
        error={people.isError}
        retry={() => void people.refetch()}
      />
      {featured && <FortuneCard person={featured} />}
      {movers.length > 0 && (
        <>
          <SectionTitle>Biggest moves this month.</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {movers.map((p, i) => (
              <Panel
                key={p.id}
                style={{
                  flexBasis: desktop ? '0%' : width < 380 ? '100%' : '46%',
                  flexGrow: 1,
                  padding: desktop ? 24 : 19,
                  gap: 17,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Avatar name={p.name ?? ''} size={40} />
                  {p.change! >= 0 ? (
                    <ArrowUpRight size={20} color={colors.green} />
                  ) : (
                    <ArrowDownRight size={20} color={colors.red} />
                  )}
                </View>
                <View>
                  <Type weight="semibold" style={{ fontSize: 15 }}>
                    {p.name}
                  </Type>
                  <Type style={{ fontSize: 11, color: colors.muted }}>{p.main_source}</Type>
                </View>
                <View>
                  <Delta value={p.change} large />
                  <Stamp at={p.asOf} />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Type style={{ fontSize: 11, color: colors.muted }}>
                    {i === 3
                      ? 'Biggest decline'
                      : i === 0
                        ? 'Biggest gain'
                        : `Estimated ${money(p.worth)}`}
                  </Type>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    onPress={() =>
                      router.push({ pathname: '/person/[slug]', params: { slug: p.slug } })
                    }
                    accessibilityLabel={`View ${p.name}`}
                  >
                    <ArrowRight size={15} color={colors.muted} />
                  </Button>
                </View>
              </Panel>
            ))}
          </View>
        </>
      )}
      {data.length > 0 && (
        <>
          <SectionTitle
            action={
              width >= 1000 ? (
                <Type style={{ fontSize: 12, color: colors.muted }}>By estimated net worth</Type>
              ) : undefined
            }
          >
            The ranking.
          </SectionTitle>
          <Panel style={{ paddingHorizontal: desktop ? 30 : 18, paddingVertical: 8 }}>
            {width >= 1000 && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 22,
                  paddingVertical: 17,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Type style={{ width: 26, fontSize: 11, color: colors.muted }}>#</Type>
                <Type style={{ flex: 1, fontSize: 11, color: colors.muted, paddingLeft: 62 }}>
                  Name
                </Type>
                <Type style={{ width: 210, fontSize: 11, color: colors.muted }}>
                  Source of wealth
                </Type>
                <Type style={{ width: 160, textAlign: 'right', fontSize: 11, color: colors.muted }}>
                  Net worth
                </Type>
                <Type style={{ width: 135, textAlign: 'right', fontSize: 11, color: colors.muted }}>
                  1-month change
                </Type>
                <View style={{ width: 16 }} />
              </View>
            )}
            {data.slice(0, 10).map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
            <View style={{ alignItems: 'center', paddingVertical: 25 }}>
              <Action secondary label="See all 20" onPress={() => router.push('/people')} />
            </View>
          </Panel>
        </>
      )}
    </Page>
  );
}
