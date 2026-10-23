import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Crud, RecordForm, type Field, type Row } from '@/components/admin/crud';
import { Body, Button, Caption, Heading, icons, minTouch, Screen, StateView } from '@/components/ui';
import { useAuth, useEvents, useHoldings, usePeople, useProjects } from '@/lib/data';
import { db } from '@/lib/supabase';
import { usd } from '@/lib/format';
import { color, desktopBreakpoint, radius, space, type } from '@/theme';

const portraitReq = (v: Record<string, string>) => !!v.portrait_url?.trim();

const personFields: Field[] = [
  { key: 'slug', label: 'Slug', kind: 'slug', req: true, hint: 'Used in the profile address, e.g. jane-doe.' },
  { key: 'name', label: 'Name', kind: 'text', req: true },
  { key: 'age', label: 'Age', kind: 'int', min: 1, max: 129 },
  { key: 'residence', label: 'Residence', kind: 'text' },
  { key: 'citizenship', label: 'Citizenship', kind: 'text' },
  { key: 'main_source', label: 'Main source of wealth', kind: 'text' },
  { key: 'bio', label: 'Bio', kind: 'text', multi: true },
  { key: 'other_assets_usd', label: 'Other assets (USD)', kind: 'num', req: true, min: 0, hint: 'Whole dollars; 0 if none are recorded.' },
  { key: 'portrait_url', label: 'Portrait image link', kind: 'url', hint: 'If set, the credit and license fields below are required.' },
  { key: 'portrait_page_url', label: 'Portrait source page', kind: 'url', req: portraitReq },
  { key: 'portrait_author', label: 'Portrait author', kind: 'text', req: portraitReq },
  { key: 'portrait_license', label: 'Portrait license', kind: 'text', req: portraitReq },
  { key: 'portrait_license_url', label: 'Portrait license link', kind: 'url', req: portraitReq },
];

const estimateFields: Field[] = [
  { key: 'as_of', label: 'As of (UTC date)', kind: 'utc', req: true, hint: 'YYYY-MM-DD' },
  { key: 'net_worth_usd', label: 'Net worth (billions of USD)', kind: 'billions', req: true, min: 0, hint: 'For example, 412.3 is stored as $412.3B.' },
  { key: 'source_label', label: 'Source name', kind: 'text', req: true },
  { key: 'source_url', label: 'Source link', kind: 'url', req: true },
];

const holdingFields: Field[] = [
  { key: 'company', label: 'Company', kind: 'text', req: true },
  { key: 'ticker', label: 'Ticker', kind: 'text' },
  { key: 'role', label: 'Role', kind: 'text' },
  { key: 'shares_owned', label: 'Shares owned', kind: 'num', req: true, min: 0 },
  { key: 'stake_percent', label: 'Stake (percent)', kind: 'num', req: true, min: 0, max: 100 },
  { key: 'is_private', label: 'Privately held', kind: 'bool' },
  { key: 'private_valuation_usd', label: 'Private valuation (USD)', kind: 'num', req: true, min: 0, hint: '0 for public companies.' },
];

const projectFields: Field[] = [
  { key: 'title', label: 'Title', kind: 'text', req: true },
  { key: 'description', label: 'Description', kind: 'text', multi: true },
  { key: 'status', label: 'Status', kind: 'choice', req: true, choices: ['new', 'upcoming'] },
  { key: 'announced_date', label: 'Announced date', kind: 'date', req: true, hint: 'YYYY-MM-DD' },
  { key: 'source_name', label: 'Source name', kind: 'text', req: true },
  { key: 'source_url', label: 'Source link', kind: 'url', req: true },
];

const eventFields: Field[] = [
  { key: 'date', label: 'Date', kind: 'date', req: true, hint: 'YYYY-MM-DD' },
  { key: 'text', label: 'Event', kind: 'text', req: true, multi: true },
];

type PersonItem = { id: string; slug: string; name: string } & Row;

function PersonEditor({ person, onSaved }: { person: PersonItem | null; onSaved: (id: string) => void }) {
  const events = useEvents(person?.id);
  const holdings = useHoldings(person?.id);
  const projects = useProjects();
  const projectRows = { ...projects, data: projects.data?.filter((p) => p.person_id === person?.id) as unknown as Row[] | undefined };

  // Estimates only come from here; "computed" rows belong to the market updater, so they are read-only.
  const values = useQuery({
    queryKey: ['values', person?.id, 'admin'],
    enabled: !!person,
    queryFn: async () => {
      const [est, comp] = await Promise.all([
        db().from('net_worth_values').select('*').eq('person_id', person!.id).eq('kind', 'estimate').order('as_of', { ascending: false }),
        db().from('net_worth_values').select('*').eq('person_id', person!.id).eq('kind', 'computed').order('as_of', { ascending: false }).limit(3),
      ]);
      if (est.error) throw est.error;
      if (comp.error) throw comp.error;
      return [...est.data, ...comp.data].sort((a, b) => b.as_of.localeCompare(a.as_of)) as Row[];
    },
  });

  const personKeys = [['people']];
  const pid = person?.id ?? '';
  return (
    <View style={styles.editor}>
      <View style={styles.sectionBlock}>
        <Heading level={2}>{person ? 'Profile.' : 'New person.'}</Heading>
        <RecordForm
          key={person?.id ?? 'new'}
          fields={personFields}
          row={person}
          table="people"
          invalidate={personKeys}
          submitLabel={person ? 'Save profile' : 'Add person'}
          onDone={(id) => id && onSaved(id)}
        />
      </View>
      {person && (
        <>
          <Crud
            title="Estimates."
            noun="estimate"
            table="net_worth_values"
            fields={estimateFields}
            rows={values}
            personId={pid}
            invalidate={[['values', pid], ['people']]}
            canEdit={false}
            canDelete={(r) => r.kind === 'estimate'}
            describe={(r) => ({
              title: `${usd(Number(r.net_worth_usd))} on ${String(r.as_of).slice(0, 10)}`,
              sub: r.kind === 'computed' ? 'Computed by the market updater. Read-only.' : `Estimate · ${r.source_label ?? 'no source'}`,
            })}
            intro={<Caption>Estimates need a named source and link. Computed values are shown read-only.</Caption>}
          />
          <Crud
            title="Holdings."
            noun="holding"
            table="holdings"
            fields={holdingFields}
            rows={holdings as never}
            personId={pid}
            invalidate={[['holdings', pid]]}
            describe={(r) => ({
              title: String(r.company),
              sub: `${r.ticker ? `${r.ticker} · ` : ''}${r.stake_percent}% stake${r.is_private ? ' · private' : ''}`,
            })}
          />
          <Crud
            title="Projects."
            noun="project"
            table="projects"
            fields={projectFields}
            rows={projectRows}
            personId={pid}
            invalidate={[['projects']]}
            describe={(r) => ({ title: String(r.title), sub: `${r.status} · announced ${r.announced_date} · ${r.source_name}` })}
          />
          <Crud
            title="Events."
            noun="event"
            table="events"
            fields={eventFields}
            rows={events as never}
            personId={pid}
            invalidate={[['events', pid]]}
            describe={(r) => ({ title: String(r.text), sub: String(r.date) })}
          />
        </>
      )}
    </View>
  );
}

function AdminApp() {
  const people = usePeople();
  const { width } = useWindowDimensions();
  const wide = width >= desktopBreakpoint;
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const person = people.data?.find((p) => p.id === selected) as PersonItem | undefined;

  const list = (
    <View style={[styles.list, wide && styles.listWide]}>
      <Heading level={2}>People.</Heading>
      {people.isPending || people.error ? (
        <StateView loading={people.isPending} error={people.error} onRetry={() => void people.refetch()} />
      ) : (
        <View style={styles.group}>
          {people.data.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => setSelected(p.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === p.id }}
              accessibilityLabel={`Edit ${p.name}`}
              style={[styles.personRow, i > 0 && styles.sep, selected === p.id && styles.personOn]}>
              <Text style={[type.headline, { color: color.text }]}>{p.name}</Text>
              <Caption>{p.slug}</Caption>
            </Pressable>
          ))}
        </View>
      )}
      <Button label="Add person" icon={icons.plus} variant="secondary" onPress={() => setSelected('new')} />
    </View>
  );

  return (
    <View style={[styles.layout, wide && styles.layoutWide]}>
      {list}
      <View style={styles.editorCol}>
        {selected === 'new' ? (
          <PersonEditor person={null} onSaved={setSelected} />
        ) : person ? (
          <PersonEditor person={person} onSaved={setSelected} />
        ) : (
          <Body secondary>Choose a person to edit, or add one.</Body>
        )}
      </View>
    </View>
  );
}

export default function Admin() {
  const router = useRouter();
  const { session, loading, isAdmin } = useAuth();
  // Same key as the provider's check; subscribing lets us avoid flashing "not an administrator" while it loads.
  const checking = useQuery({ queryKey: ['admin', session?.user.id], enabled: false }).isFetching;

  let body;
  if (loading || checking) body = <StateView loading />;
  else if (!session)
    body = (
      <StateView
        empty={{
          title: 'Sign in required.',
          body: 'Administration is limited to signed-in administrators.',
          action: <Button label="Sign in" onPress={() => router.push('/account')} />,
        }}
      />
    );
  else if (!isAdmin)
    body = <StateView empty={{ title: 'This account isn’t an administrator.', body: 'Sign in with an administrator account to edit data.' }} />;
  else body = <AdminApp />;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Heading>Admin.</Heading>
        {body}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  layout: { gap: space.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  list: { gap: space.md },
  listWide: { width: 280 },
  editorCol: { flex: 1, minWidth: 0 },
  editor: { gap: space.xl },
  sectionBlock: { gap: space.md },
  group: { backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  personRow: { minHeight: minTouch, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: 'center', gap: 2 },
  personOn: { backgroundColor: color.fill },
});
