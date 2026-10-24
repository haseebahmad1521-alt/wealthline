import { Link, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SavedViews, useAppliedView } from '@/components/saved-views';
import { Body, Caption, Heading, Icon, Screen, StateView, Surface, icons, minTouch } from '@/components/ui';
import { usePeople, useProjects } from '@/lib/data';
import { formatDate } from '@/lib/format';
import type { ProjectStatus } from '@/lib/view-params';
import { color, radius, space, type } from '@/theme';

const filters = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'upcoming', label: 'Upcoming' },
] as const;

export default function Projects() {
  const projects = useProjects();
  const people = usePeople();
  const [filter, setFilter] = useState<ProjectStatus>('all');
  const { view } = useLocalSearchParams<{ view?: string }>();
  const applied = useAppliedView('projects', view);
  const [seen, setSeen] = useState<string>();
  if (applied && applied.target === 'projects' && seen !== applied.id) {
    setSeen(applied.id);
    setFilter(applied.params.status);
  }
  const byId = new Map((people.data ?? []).map((p) => [p.id, p]));
  const shown = (projects.data ?? []).filter((p) => filter === 'all' || p.status === filter);
  const pending = projects.isPending || people.isPending;
  const error = projects.error ?? people.error;

  return (
    <Screen>
      <View>
        <Heading>Projects.</Heading>
        <Body secondary>What the world’s biggest fortunes are building next.</Body>
      </View>
      <View accessibilityRole="tablist" style={styles.segments}>
        {filters.map((f) => {
          const selected = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="tab"
              accessibilityLabel={f.label}
              accessibilityState={{ selected }}
              onPress={() => setFilter(f.key)}
              style={[styles.segment, selected && styles.segmentOn]}>
              <Text style={[type.headline, { color: selected ? color.text : color.textSecondary }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <SavedViews
        target="projects"
        params={{ status: filter }}
        onApply={(v) => v.target === 'projects' && setFilter(v.params.status)}
      />
      {pending || error ? (
        <StateView
          loading={pending}
          error={error}
          onRetry={() => {
            void projects.refetch();
            void people.refetch();
          }}
        />
      ) : shown.length === 0 ? (
        <StateView empty={{ title: 'No projects here yet.', body: 'Sourced announcements appear once they’re entered.' }} />
      ) : (
        <Surface style={styles.list}>
          {shown.map((p, i) => {
            const person = byId.get(p.person_id);
            return (
              <Fragment key={p.id}>
                {i > 0 && <View style={styles.separator} />}
                <View style={styles.item}>
                  <Text style={[type.headline, { color: color.text }]}>{p.title}</Text>
                  {person && (
                    <Link href={`/person/${person.slug}`} asChild>
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={`${person.name}, opens profile`}
                        style={styles.link}>
                        <Text style={[type.body, { color: color.action }]}>{person.name}</Text>
                      </Pressable>
                    </Link>
                  )}
                  {p.description && <Body secondary>{p.description}</Body>}
                  <Caption>
                    {p.status === 'new' ? 'New' : 'Upcoming'} · Announced {formatDate(p.announced_date)}
                  </Caption>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Source: ${p.source_name}, opens in browser`}
                    onPress={() => void WebBrowser.openBrowserAsync(p.source_url)}
                    style={[styles.link, styles.source]}>
                    <Text style={[type.caption, { color: color.action }]}>{p.source_name}</Text>
                    <Icon name={icons.link} size={12} tint={color.action} />
                  </Pressable>
                </View>
              </Fragment>
            );
          })}
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  segment: {
    minHeight: minTouch,
    minWidth: 80,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: color.surface },
  list: { overflow: 'hidden', paddingVertical: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.md },
  item: { padding: space.md, gap: space.xs },
  link: { minHeight: minTouch, justifyContent: 'center', alignSelf: 'flex-start' },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
