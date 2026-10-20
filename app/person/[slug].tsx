import { View, Platform, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, Link, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { bilt } from '@/lib/bilt';
import { usePeople, useProjects, type Person } from '@/lib/wealthline';
import {
  Page,
  Type,
  Avatar,
  FortuneCard,
  SectionTitle,
  Panel,
  Empty,
  DataState,
  ProjectCard,
  FollowButton,
  Stamp,
} from '@/components/wealthline-ui';
import { colors, money } from '@/lib/wealthline-theme';
export default function Profile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const people = usePeople();
  const person = people.data?.find((p) => p.slug === slug);
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: Platform.OS !== 'web',
          title: person?.name ?? 'Profile',
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
        }}
      />
      <Page>
        <DataState
          loading={people.isPending}
          error={people.isError}
          retry={() => void people.refetch()}
        />
        {person?.name ? (
          <ProfileContent person={person} />
        ) : !people.isPending && !people.isError ? (
          <Empty title="This profile is not published yet." />
        ) : null}
      </Page>
    </>
  );
}
function ProfileContent({ person }: { person: Person }) {
  const { width } = useWindowDimensions();
  const projects = useProjects();
  const detail = useQuery({
    queryKey: ['detail', person.id],
    queryFn: async () => {
      const [holdings, events, ranks] = await Promise.all([
        bilt.from('holdings').select('*').eq('billionaire_id', person.id),
        bilt
          .from('events')
          .select('*')
          .eq('billionaire_id', person.id)
          .order('date', { ascending: false }),
        bilt
          .from('rank_history')
          .select('*')
          .eq('billionaire_id', person.id)
          .order('recorded_at', { ascending: false })
          .limit(2),
      ]);
      if (holdings.error) throw holdings.error;
      if (events.error) throw events.error;
      if (ranks.error) throw ranks.error;
      return { holdings: holdings.data ?? [], events: events.data ?? [], ranks: ranks.data ?? [] };
    },
  });
  return (
    <>
      <View style={{ paddingTop: 26 }}>
        <Link href="/people">
          <Type style={{ color: colors.blue, fontSize: 12 }}>All people</Type>
        </Link>
      </View>
      <View style={{ paddingTop: 30, paddingBottom: 35, gap: 25 }}>
        <View
          style={{
            flexDirection: width >= 600 ? 'row' : 'column',
            gap: 20,
            alignItems: width >= 600 ? 'center' : 'flex-start',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: width >= 800 ? 20 : 14,
              alignItems: 'center',
              width: width >= 600 ? undefined : '100%',
              flex: width >= 600 ? 1 : undefined,
            }}
          >
            <Avatar name={person.name!} size={width >= 800 ? 76 : 52} />
            <View style={{ flex: 1 }}>
              <Type
                weight="bold"
                style={{
                  fontSize: width >= 800 ? 56 : 34,
                  lineHeight: width >= 800 ? 66 : 42,
                  letterSpacing: -1.5,
                }}
              >
                {person.name}
              </Type>
              <Type style={{ color: colors.muted, fontSize: 13 }}>
                Rank #{person.rank} · {person.main_source}
              </Type>
              <Stamp at={person.updated_at} />
            </View>
          </View>
          <FollowButton person={person} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 22 }}>
          {person.age != null && <Type style={{ color: colors.muted }}>Age {person.age}</Type>}
          {!!person.residence && <Type style={{ color: colors.muted }}>{person.residence}</Type>}
          {!!person.citizenship && (
            <Type style={{ color: colors.muted }}>{person.citizenship}</Type>
          )}
        </View>
        {!!person.bio && <Type style={{ maxWidth: 740, lineHeight: 25 }}>{person.bio}</Type>}
        <Type
          style={{
            fontSize: 11,
            color:
              detail.data && detail.data.ranks.length > 1
                ? detail.data.ranks[1].rank > person.rank
                  ? colors.green
                  : detail.data.ranks[1].rank < person.rank
                    ? colors.red
                    : colors.muted
                : colors.muted,
          }}
        >
          {detail.data && detail.data.ranks.length > 1
            ? detail.data.ranks[1].rank === person.rank
              ? 'No change since the previous ranking.'
              : `${detail.data.ranks[1].rank > person.rank ? '▲' : '▼'} ${Math.abs(detail.data.ranks[1].rank - person.rank)} ${Math.abs(detail.data.ranks[1].rank - person.rank) === 1 ? 'place' : 'places'} since the previous ranking.`
            : 'Rank history begins October 1, 2026.'}
        </Type>
      </View>
      <FortuneCard person={person} profile />
      <SectionTitle>Why it moved.</SectionTitle>
      <Panel style={{ padding: 28, gap: 10 }}>
        <Type weight="semibold" style={{ fontSize: 20 }}>
          {person.change == null
            ? 'Monthly change is not available yet.'
            : `A change of ${money(Math.abs(person.change))} in the last month.`}
        </Type>
        <Stamp at={person.asOf} />
        <Type style={{ color: colors.muted, lineHeight: 24, maxWidth: 740 }}>
          Net worth is based on public shares, private stakes and other assets. A verified
          explanation for this movement has not been added; net worth changes are not cash income.
        </Type>
      </Panel>
      <DataState
        loading={detail.isPending}
        error={detail.isError}
        retry={() => void detail.refetch()}
      />
      <SectionTitle>Companies.</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
        {detail.data?.holdings.map((h) => (
          <Panel
            key={h.id}
            style={{ flexGrow: 1, flexBasis: width >= 800 ? '30%' : '100%', padding: 26, gap: 18 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Type weight="semibold" style={{ fontSize: 21, flex: 1 }}>
                {h.company}
              </Type>
              <Type style={{ color: colors.muted, fontSize: 11 }}>
                {h.is_private ? 'Private' : h.ticker}
              </Type>
            </View>
            <Type style={{ color: colors.muted, fontSize: 13 }}>{h.role ?? 'Investor'}</Type>
            <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 15, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Type style={{ color: colors.muted, fontSize: 12 }}>Stake</Type>
                <Type style={{ fontSize: 13 }}>
                  {h.stake_percent > 0 ? `${h.stake_percent}%` : 'Not entered'}
                </Type>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Type style={{ color: colors.muted, fontSize: 12 }}>Valuation</Type>
                <Type style={{ fontSize: 13 }}>
                  {h.is_private && h.private_valuation_usd > 0
                    ? money(h.private_valuation_usd)
                    : 'Not entered'}
                </Type>
              </View>
              <Stamp at={person.updated_at} />
            </View>
          </Panel>
        ))}
      </View>
      {detail.data?.holdings.length === 0 && (
        <Empty title="Company holdings will appear here when added." />
      )}
      <SectionTitle>Projects.</SectionTitle>
      <DataState
        loading={projects.isPending}
        error={projects.isError}
        retry={() => void projects.refetch()}
      />
      {(['new', 'upcoming'] as const).map((status) => {
        const rows =
          projects.data?.filter((p) => p.billionaire_id === person.id && p.status === status) ?? [];
        return (
          <View key={status} style={{ marginBottom: 22, gap: 16 }}>
            <Type
              weight="semibold"
              style={{ fontSize: 18, color: status === 'new' ? colors.green : colors.amber }}
            >
              {status === 'new' ? 'New' : 'Upcoming · reported'}
            </Type>
            {rows.map((p) => (
              <ProjectCard key={p.id} project={p} person={person} />
            ))}
            {!projects.isPending && !projects.isError && rows.length === 0 && (
              <Empty
                title={
                  status === 'new'
                    ? 'New projects will appear here when published.'
                    : 'Reported upcoming projects will appear here when added.'
                }
              />
            )}
          </View>
        );
      })}
      <SectionTitle>Timeline.</SectionTitle>
      {detail.data?.events.length ? (
        <Panel style={{ padding: 28, gap: 25 }}>
          {detail.data.events.map((e) => (
            <View
              key={e.id}
              style={{ flexDirection: width >= 600 ? 'row' : 'column', gap: width >= 600 ? 25 : 6 }}
            >
              <Type style={{ color: colors.muted, width: 100, fontSize: 12 }}>
                {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Type>
              <Type style={{ flex: 1, lineHeight: 24 }}>{e.text}</Type>
            </View>
          ))}
        </Panel>
      ) : !detail.isPending && !detail.isError ? (
        <Empty title="Milestones will appear here when added." />
      ) : null}
    </>
  );
}
