// Projects page game layer (owner, Nov 2, 2026): a top-3 podium, headlines that name a project, and the recorded wealth
// moves of the people building them. Everything comes from recorded rows via lib/projects.ts; a wealth move is the
// owner's recorded change, never attributed to a project.
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MEDAL, Rise } from '@/components/arena';
import { Glass } from '@/components/glass';
import { NewsList } from '@/components/news';
import { Caption, Change, Heading, Portrait } from '@/components/ui';
import type { Person } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { builderMoves, podiumProjects, projectHeadlines } from '@/lib/projects';
import type { PersonNews, Project } from '@/lib/types';
import { color, radius, space, type } from '@/theme';

const short = (name: string) => name.replace(/ & family$/, '');

function Step({ project, owner, place, height, i }: { project: Project; owner: Person; place: number; height: number; i: number }) {
  const size = place === 1 ? 64 : 50;
  return (
    <Link href={`/person/${owner.slug}`} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`Number ${place}, ${project.title}, by ${owner.name}, opens profile`} style={styles.step}>
        <Rise i={i + 3} from={12} style={styles.stepTop}>
          <View style={[styles.ring, { borderColor: MEDAL[place - 1], borderRadius: (size + 8) / 2 }]}>
            <Portrait uri={owner.portrait_url} name={owner.name} size={size} />
          </View>
          <Text style={[type.headline, styles.center, { color: color.text, fontSize: place === 1 ? 17 : 15 }]} numberOfLines={3}>
            {project.title}
          </Text>
          <Caption style={styles.center} numberOfLines={2}>
            {short(owner.name)}
          </Caption>
        </Rise>
        <Rise i={i} from={height} style={[styles.pedestal, { height, backgroundColor: MEDAL[place - 1] }]}>
          <Text style={styles.pedestalText}>{place}</Text>
        </Rise>
      </Pressable>
    </Link>
  );
}

/** Each builder's latest project, top three by the builder's rank: #2, #1 (tallest), #3. Needs three builders. */
export function ProjectPodium({ projects, byId }: { projects: Project[]; byId: Map<string, Person> }) {
  const top = podiumProjects(projects, byId);
  if (top.length < 3) return null;
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Heading level={2}>Top projects.</Heading>
        <Caption>by their builder’s rank</Caption>
      </View>
      <Glass style={styles.podiumCard}>
        <View style={styles.podium} accessibilityRole="list" accessibilityLabel="Top three projects">
          <Step {...top[1]} place={2} height={64} i={1} />
          <Step {...top[0]} place={1} height={92} i={0} />
          <Step {...top[2]} place={3} height={48} i={2} />
        </View>
      </Glass>
    </View>
  );
}

/** Cached headlines about a builder whose title names one of their projects. */
export function ProjectNews({ news, projects, byId }: { news: PersonNews[]; projects: Project[]; byId: Map<string, Person> }) {
  const items = projectHeadlines(news, projects).slice(0, 5).map((x) => x.item);
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Heading level={2}>Project news.</Heading>
      <NewsList items={items} personOf={(id) => (id ? byId.get(id) : undefined)} />
    </View>
  );
}

/** The builders' recorded wealth changes since their previous values. Shown beside projects, not caused by them. */
export function BuilderMoves({ projects, byId }: { projects: Project[]; byId: Map<string, Person> }) {
  const moves = builderMoves(projects, byId);
  if (!moves.length) return null;
  return (
    <View style={styles.section}>
      <Heading level={2}>Builders’ wealth moves.</Heading>
      <Caption>Recorded change in each builder’s net worth since their previous value. Not attributed to any project.</Caption>
      <Glass style={styles.list}>
        {moves.map(({ owner, delta, base }, i) => (
          <Rise key={owner.id} i={i}>
            <Link href={`/person/${owner.slug}`} asChild>
              <Pressable accessibilityRole="link" style={i > 0 ? styles.rowSep : styles.row}>
                <Portrait uri={owner.portrait_url} name={owner.name} size={34} />
                <View style={styles.flex}>
                  <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                    {short(owner.name)}
                  </Text>
                  {owner.prev_as_of && <Caption>since {formatDate(owner.prev_as_of)}</Caption>}
                </View>
                <Change delta={delta} base={base} size={14} compact />
              </Pressable>
            </Link>
          </Rise>
        ))}
      </Glass>
    </View>
  );
}

// Link asChild needs a flat style on its child (expo-router rejects style arrays there).
const row = { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm + 2, minHeight: 44 } as const;

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  section: { gap: space.sm },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: space.sm },
  podiumCard: { paddingTop: space.lg, paddingHorizontal: space.sm, paddingBottom: 0, overflow: 'hidden', borderRadius: radius.lg },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  step: { flex: 1, minWidth: 0, alignItems: 'center' },
  stepTop: { alignItems: 'center', gap: 4, paddingHorizontal: 2, paddingBottom: space.sm },
  ring: { borderWidth: 4 },
  pedestal: { alignSelf: 'stretch', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  pedestalText: { ...type.title, color: '#FFFFFF', fontSize: 26, lineHeight: 30 },
  list: { paddingVertical: space.xs, borderRadius: radius.lg },
  row,
  rowSep: { ...row, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },

});
