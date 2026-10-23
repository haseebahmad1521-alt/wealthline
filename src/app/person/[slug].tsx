import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { NewsList, newsDisclosure } from '@/components/news';
import { ProfileHero } from '@/components/profile-hero';
import { Body, Caption, Change, Heading, Icon, Provenance, Screen, StateView, Surface, icons, minTouch } from '@/components/ui';
import { WealthChart } from '@/components/wealth-chart';
import { useEvents, useHoldings, usePerson, usePersonNews, useProjects, useValues, useWatchlist } from '@/lib/data';
import { formatDate, usd } from '@/lib/format';
import { live as computeLive } from '@/lib/live';
import { color, desktopBreakpoint, space, type } from '@/theme';

export default function Profile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const person = usePerson(slug);
  const p = person.data;
  const values = useValues(p?.id, null); // shortcut: loads all history; page by window once rows reach ~10k per person
  const holdings = useHoldings(p?.id);
  const events = useEvents(p?.id);
  const projects = useProjects();
  const news = usePersonNews(p?.id);
  const watch = useWatchlist();
  const desktop = useWindowDimensions().width >= desktopBreakpoint;

  const points = (values.data ?? []).map((v) => ({
    t: Date.parse(v.as_of),
    v: Number(v.net_worth_usd),
    estimate: v.kind === 'estimate',
  }));
  const computed = points.filter((x) => !x.estimate);
  const latest = points.at(-1) ?? null;

  // The clock only ticks while a projection is running; otherwise nothing on screen depends on it.
  const [now, setNow] = useState(() => Date.now());
  const live = computeLive(computed, latest, now);
  useEffect(() => {
    if (live.status !== 'projected') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.status]);

  if (person.isPending || person.error || !p) {
    return (
      <Screen>
        <View style={{ height: 80 }} />
        <StateView
          loading={person.isPending}
          error={person.error}
          onRetry={() => void person.refetch()}
          empty={{ title: 'Person not found.', body: 'This profile doesn’t exist or was removed.' }}
        />
      </Screen>
    );
  }

  const prev = p.prev_net_worth_usd;
  const shown = live.value ?? p.net_worth_usd;
  const theirProjects = (projects.data ?? []).filter((x) => x.person_id === p.id);
  const liveDigits = live.status === 'projected' ? 3 : 1;

  return (
    <Screen>
      <ProfileHero
        person={p}
        watched={watch.ids.includes(p.id)}
        watchPending={watch.pending === p.id}
        onToggleWatch={() => (watch.signedIn ? void watch.toggle(p.id) : router.push('/account'))}
      />
      {watch.actionError && <Caption style={{ color: color.loss }}>{watch.actionError}</Caption>}

      <View style={styles.value}>
        <Text
          style={styles.worth}
          accessibilityLabel={shown != null ? `Net worth ${usd(shown)}` : 'No net worth estimate yet'}>
          {shown != null ? usd(shown, liveDigits) : '—'}
        </Text>
        {shown != null && prev != null && p.prev_as_of && (
          <View style={styles.changeRow}>
            <Change delta={(p.net_worth_usd ?? shown) - prev} base={prev} />
            <Caption>since {formatDate(p.prev_as_of)}</Caption>
          </View>
        )}
        <Provenance status={live.status} at={live.observedAt} />
        {live.status === 'projected' && (
          <Caption>
            Between market updates the value follows the latest observed trend for at most 15 minutes. It is an
            estimate, not a live quote.
          </Caption>
        )}
      </View>

      <Surface style={styles.chartCard}>
        {values.isPending || values.error ? (
          <StateView loading={values.isPending} error={values.error} onRetry={() => void values.refetch()} />
        ) : (
          <WealthChart points={points} live={live} now={now} />
        )}
      </Surface>

      <View style={desktop ? styles.columns : styles.stack}>
        <View style={styles.column}>
          <Heading level={2}>Profile.</Heading>
          <Surface style={styles.facts}>
            <Fact label="Source of wealth" value={p.main_source} />
            <Fact label="Citizenship" value={p.citizenship} />
            <Fact label="Residence" value={p.residence} />
            <Fact label="Age" value={p.age?.toString()} />
          </Surface>
          {!!p.bio && <Body style={styles.bio}>{p.bio}</Body>}
          {latest && <SourceLine values={values.data ?? []} />}
        </View>

        <View style={styles.column}>
          <Heading level={2}>Holdings.</Heading>
          {holdings.data?.length ? (
            <Surface style={styles.facts}>
              {holdings.data.map((h) => (
                <View key={h.id} style={styles.fact}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: color.text }]}>{h.company}</Text>
                    <Caption>{[h.ticker, h.role, h.is_private ? 'Private' : null].filter(Boolean).join(' · ')}</Caption>
                  </View>
                  {/* 0 means "not recorded" in the source data, not a 0% stake. */}
                  {h.stake_percent > 0 && <Text style={[type.number, { color: color.text }]}>{h.stake_percent}%</Text>}
                </View>
              ))}
            </Surface>
          ) : (
            <Body secondary>{holdings.isPending ? 'Loading…' : 'No verified holdings recorded yet.'}</Body>
          )}
        </View>
      </View>

      {theirProjects.length > 0 && (
        <>
          <Heading level={2}>Projects.</Heading>
          <Surface style={styles.facts}>
            {theirProjects.map((x) => (
              <Pressable
                key={x.id}
                accessibilityRole="link"
                accessibilityHint={`Opens ${x.source_name}`}
                onPress={() => void WebBrowser.openBrowserAsync(x.source_url)}
                style={({ pressed }) => [styles.fact, pressed && { backgroundColor: color.fill }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.headline, { color: color.text }]}>{x.title}</Text>
                  {!!x.description && <Body secondary>{x.description}</Body>}
                  <Caption>
                    {x.status === 'new' ? 'New' : 'Upcoming'} · {formatDate(x.announced_date)} · {x.source_name}
                  </Caption>
                </View>
                <Icon name={icons.link} size={14} tint={color.textSecondary} />
              </Pressable>
            ))}
          </Surface>
        </>
      )}

      {!!news.data?.length && (
        <>
          <Heading level={2}>In the news.</Heading>
          <Caption>{newsDisclosure}</Caption>
          <NewsList items={news.data} />
        </>
      )}

      {!!events.data?.length && (
        <>
          <Heading level={2}>Timeline.</Heading>
          <Surface style={styles.facts}>
            {events.data.map((e) => (
              <View key={e.id} style={styles.fact}>
                <Caption style={styles.eventDate}>{formatDate(e.date)}</Caption>
                <Body style={{ flex: 1 }}>{e.text}</Body>
              </View>
            ))}
          </Surface>
        </>
      )}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Caption style={{ flex: 1 }}>{label}</Caption>
      <Text style={[type.body, { color: color.text, flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

/** Where the latest dated estimate came from. */
function SourceLine({ values }: { values: { kind: string; as_of: string; source_label: string | null; source_url: string | null }[] }) {
  const est = [...values].reverse().find((v) => v.kind === 'estimate' && v.source_label);
  if (!est) return null;
  return (
    <Pressable
      accessibilityRole="link"
      disabled={!est.source_url}
      onPress={() => est.source_url && void WebBrowser.openBrowserAsync(est.source_url)}
      style={styles.source}>
      <Caption>
        Latest estimate {formatDate(est.as_of)} · Source: {est.source_label}
      </Caption>
      {est.source_url && <Icon name={icons.link} size={11} tint={color.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  value: { gap: space.sm },
  worth: { ...type.display, fontSize: 44, lineHeight: 50, color: color.text, fontVariant: ['tabular-nums'] },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chartCard: { padding: space.md },
  columns: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  stack: { gap: space.lg },
  column: { flex: 1, gap: space.sm },
  facts: { paddingVertical: space.xs, overflow: 'hidden' },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouch,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  bio: { marginTop: space.sm, maxWidth: 680 },
  eventDate: { width: 96 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: minTouch },
});
