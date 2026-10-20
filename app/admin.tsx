import { useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { Button, Input, Label, TextField, FieldError } from 'heroui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tables } from '@biltme/backend';
import * as Haptics from 'expo-haptics';
import { LockKeyhole } from 'lucide-react-native';
import { bilt } from '@/lib/bilt';
import { useAuth, usePeople, type Person } from '@/lib/wealthline';
import { Page, Type, Panel, DataState, Action } from '@/components/wealthline-ui';
import SignIn from '@/components/SignIn';
import DateField from '@/components/DateField';
import { colors } from '@/lib/wealthline-theme';

type Kind = 'person' | 'holdings' | 'projects' | 'events';
type Row = Tables<'holdings'> | Tables<'projects'> | Tables<'events'>;
type Field = { key: string; label: string; number?: boolean; date?: boolean; multiline?: boolean };
const fields: Record<Kind, Field[]> = {
  person: [
    { key: 'name', label: 'Name' },
    { key: 'slug', label: 'Profile URL slug' },
    { key: 'rank', label: 'Rank (swaps with current occupant)', number: true },
    { key: 'age', label: 'Age', number: true },
    { key: 'residence', label: 'Residence' },
    { key: 'citizenship', label: 'Citizenship' },
    { key: 'main_source', label: 'Main source of wealth' },
    { key: 'bio', label: 'Biography', multiline: true },
    { key: 'other_assets_usd', label: 'Other assets / calibration (USD)', number: true },
    { key: 'initial_estimate_usd', label: 'Initial published net worth (USD)', number: true },
  ],
  holdings: [
    { key: 'company', label: 'Company' },
    { key: 'ticker', label: 'Ticker (public companies)' },
    { key: 'role', label: 'Role' },
    { key: 'shares_owned', label: 'Shares owned', number: true },
    { key: 'stake_percent', label: 'Stake (%)', number: true },
    { key: 'private_valuation_usd', label: 'Private company valuation (USD)', number: true },
  ],
  projects: [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description', multiline: true },
    { key: 'announced_date', label: 'Announced date', date: true },
    { key: 'source_name', label: 'Source name' },
    { key: 'source_url', label: 'Source URL (https://)' },
  ],
  events: [
    { key: 'date', label: 'Date', date: true },
    { key: 'text', label: 'Milestone', multiline: true },
  ],
};
function createForm(person: Person, kind: Kind, row?: Row): Record<string, string> {
  const source: Record<string, string | number | boolean | null> | undefined =
    kind === 'person' ? person : row;
  const next: Record<string, string> = {};
  for (const field of fields[kind]) {
    const value = source?.[field.key];
    next[field.key] =
      value == null
        ? field.date
          ? new Date().toISOString().slice(0, 10)
          : field.number
            ? '0'
            : ''
        : String(value);
  }
  next.is_private = source && 'is_private' in source ? String(source.is_private) : 'false';
  next.status = row && 'status' in row ? row.status : 'new';
  return next;
}
export default function Admin() {
  const auth = useAuth();
  const people = usePeople();
  const [selected, setSelected] = useState('');
  const { width } = useWindowDimensions();
  const person = people.data?.find((p) => p.id === selected) ?? people.data?.[0];
  return (
    <Page>
      <View style={{ paddingTop: 45, paddingBottom: 30 }}>
        <Type
          weight="bold"
          style={{ fontSize: width >= 800 ? 56 : 38, lineHeight: 64, letterSpacing: -2 }}
        >
          The editor.
        </Type>
      </View>
      {auth.loading ? (
        <DataState loading error={false} retry={() => undefined} />
      ) : !auth.user ? (
        <SignIn />
      ) : !auth.isAdmin ? (
        <Panel style={{ padding: 38, gap: 20, alignItems: 'center' }}>
          <LockKeyhole color={colors.muted} />
          <Type weight="semibold" style={{ fontSize: 22 }}>
            Admin access is restricted.
          </Type>
          <Type style={{ color: colors.muted, textAlign: 'center' }}>
            Only the designated owner can edit Wealthline.
          </Type>
          <Action
            label="Open watchlist"
            onPress={() => {
              void import('expo-router').then(({ router }) => router.push('/watchlist'));
            }}
            secondary
          />
        </Panel>
      ) : (
        <>
          <DataState
            loading={people.isPending}
            error={people.isError}
            retry={() => void people.refetch()}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 25 }}
          >
            {people.data?.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={p.id === person?.id ? 'primary' : 'secondary'}
                className="rounded-full"
                onPress={() => {
                  setSelected(p.id);
                  void Haptics.selectionAsync();
                }}
              >
                <Button.Label>
                  #{p.rank} {p.name ?? 'Empty'}
                </Button.Label>
              </Button>
            ))}
          </ScrollView>
          {person && <Editor key={person.id} person={person} />}
        </>
      )}
    </Page>
  );
}
function Editor({ person }: { person: Person }) {
  const cache = useQueryClient();
  const [kind, setKind] = useState<Kind>('person');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => createForm(person, 'person'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const detail = useQuery({
    queryKey: ['admin-detail', person.id],
    queryFn: async () => {
      const [h, p, e] = await Promise.all([
        bilt.from('holdings').select('*').eq('billionaire_id', person.id),
        bilt.from('projects').select('*').eq('billionaire_id', person.id),
        bilt.from('events').select('*').eq('billionaire_id', person.id),
      ]);
      if (h.error) throw h.error;
      if (p.error) throw p.error;
      if (e.error) throw e.error;
      return { holdings: h.data ?? [], projects: p.data ?? [], events: e.data ?? [] };
    },
  });
  function reset(k: Kind, row?: Row) {
    setForm(createForm(person, k, row));
    setEditId(row?.id ?? null);
    setConfirm(false);
    setError('');
    setMessage('');
  }
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  function fail(text: string) {
    setError(text);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
  function num(key: string) {
    const n = Number(form[key]);
    if (!form[key]?.trim() || !Number.isFinite(n))
      throw new Error(
        `Enter a valid number for ${fields[kind].find((f) => f.key === key)?.label ?? key}.`,
      );
    return n;
  }
  async function saved() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['people'] }),
      cache.invalidateQueries({ queryKey: ['admin-detail', person.id] }),
      cache.invalidateQueries({ queryKey: ['projects'] }),
      cache.invalidateQueries({ queryKey: ['detail', person.id] }),
    ]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMessage('Saved.');
  }
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (kind === 'person') {
        if (!form.name?.trim() || !form.slug?.match(/^[a-z0-9-]+$/))
          throw new Error('Enter a name and a lowercase URL slug.');
        const rank = num('rank');
        if (!Number.isInteger(rank) || rank < 1 || rank > 20)
          throw new Error('Rank must be between 1 and 20.');
        const age = form.age && form.age !== '0' ? num('age') : null;
        if (age != null && (!Number.isInteger(age) || age < 1))
          throw new Error('Enter a valid age.');
        const initialEstimate = person.worth == null ? num('initial_estimate_usd') : null;
        if (initialEstimate != null && initialEstimate <= 0)
          throw new Error('Enter a positive initial net worth estimate.');
        const r = await bilt
          .from('billionaires')
          .update({
            name: form.name.trim(),
            slug: form.slug.trim(),
            age,
            residence: form.residence || null,
            citizenship: form.citizenship || null,
            main_source: form.main_source || null,
            bio: form.bio || null,
            other_assets_usd: num('other_assets_usd'),
            updated_at: new Date().toISOString(),
          })
          .eq('id', person.id);
        if (r.error)
          throw new Error('Could not save this person. Check the URL slug and try again.');
        if (initialEstimate != null) {
          const snapshot = await bilt.from('net_worth_snapshots').insert({
            billionaire_id: person.id,
            timestamp: new Date().toISOString(),
            net_worth_usd: initialEstimate,
          });
          if (snapshot.error)
            throw new Error(
              'Profile saved, but the initial estimate could not be recorded. Try again.',
            );
        }
        if (rank !== person.rank) {
          const swap = await bilt.rpc('swap_wealthline_rank', {
            person_id: person.id,
            target_rank: rank,
          });
          if (swap.error)
            throw new Error(
              'Profile saved, but the rank change failed. Try the rank change again.',
            );
        }
      } else if (kind === 'holdings') {
        if (!form.company?.trim()) throw new Error('Enter a company name.');
        const stake = num('stake_percent'),
          shares = num('shares_owned'),
          valuation = num('private_valuation_usd');
        if (stake < 0 || stake > 100 || shares < 0 || valuation < 0)
          throw new Error('Shares and valuations must be nonnegative. Stake must be 0–100%.');
        if (form.is_private === 'false' && shares > 0 && !form.ticker?.trim())
          throw new Error('Add a ticker for public shares.');
        const payload = {
          billionaire_id: person.id,
          company: form.company.trim(),
          ticker: form.ticker?.trim().toUpperCase() || null,
          role: form.role || null,
          shares_owned: shares,
          stake_percent: stake,
          private_valuation_usd: valuation,
          is_private: form.is_private === 'true',
        };
        const r = editId
          ? await bilt.from('holdings').update(payload).eq('id', editId)
          : await bilt.from('holdings').insert(payload);
        if (r.error) throw new Error('Could not save this holding. Try again.');
        const updateTime = await bilt
          .from('billionaires')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', person.id);
        if (updateTime.error)
          throw new Error('Holding saved, but its update time could not be saved. Try again.');
      } else if (kind === 'projects') {
        if (
          !form.title?.trim() ||
          !form.source_name?.trim() ||
          !(form.source_url ?? '').startsWith('https://') ||
          !form.announced_date
        )
          throw new Error('Add a title, announcement date, source name and HTTPS source link.');
        const payload = {
          billionaire_id: person.id,
          title: form.title.trim(),
          description: form.description || null,
          announced_date: form.announced_date,
          source_name: form.source_name.trim(),
          source_url: form.source_url.trim(),
          status: form.status === 'upcoming' ? ('upcoming' as const) : ('new' as const),
        };
        const r = editId
          ? await bilt.from('projects').update(payload).eq('id', editId)
          : await bilt.from('projects').insert(payload);
        if (r.error) throw new Error('Could not save this project. Try again.');
      } else {
        if (!form.text?.trim() || !form.date) throw new Error('Add a date and milestone.');
        const payload = { billionaire_id: person.id, date: form.date, text: form.text.trim() };
        const r = editId
          ? await bilt.from('events').update(payload).eq('id', editId)
          : await bilt.from('events').insert(payload);
        if (r.error) throw new Error('Could not save this milestone. Try again.');
      }
      await saved();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!editId || kind === 'person') return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      const r = await bilt.from(kind).delete().eq('id', editId).eq('billionaire_id', person.id);
      if (r.error) throw r.error;
      reset(kind);
      await saved();
      setMessage('Deleted.');
    } catch {
      fail('Could not delete. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function updateMarket() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await bilt.functions.invoke('update-net-worth', { body: {} });
      if (r.error || r.data?.error)
        throw new Error(r.data?.error ?? 'Could not update market prices. Try again.');
      setMessage(r.data?.message ?? 'Updated.');
      await cache.invalidateQueries({ queryKey: ['people'] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not update prices.');
    } finally {
      setBusy(false);
    }
  }
  const rows = kind === 'person' ? [] : (detail.data?.[kind] ?? []);
  return (
    <View style={{ gap: 25 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['person', 'holdings', 'projects', 'events'] as const).map((k) => (
          <Button
            key={k}
            variant={kind === k ? 'primary' : 'secondary'}
            size="sm"
            className="rounded-full"
            isDisabled={busy}
            onPress={() => {
              if (k !== kind) {
                setKind(k);
                reset(k);
              }
              void Haptics.selectionAsync();
            }}
          >
            <Button.Label>
              {k === 'person' ? 'Person & rank' : k[0].toUpperCase() + k.slice(1)}
            </Button.Label>
          </Button>
        ))}
      </View>
      {kind !== 'person' && (
        <>
          <DataState
            loading={detail.isPending}
            error={detail.isError}
            retry={() => void detail.refetch()}
          />
          <Panel style={{ padding: 22, gap: 12 }}>
            {rows.map((row) => (
              <View
                key={row.id}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Type style={{ flex: 1 }}>
                  {'company' in row ? row.company : 'title' in row ? row.title : row.text}
                </Type>
                <Action
                  small
                  secondary
                  disabled={busy}
                  label="Edit"
                  onPress={() => reset(kind, row)}
                />
              </View>
            ))}
            {!detail.isPending && rows.length === 0 && (
              <Type style={{ color: colors.muted }}>No entries yet.</Type>
            )}
            <Action
              secondary
              label={`Add ${kind === 'holdings' ? 'holding' : kind === 'projects' ? 'project' : 'milestone'}`}
              disabled={busy}
              onPress={() => reset(kind)}
            />
          </Panel>
        </>
      )}
      <Panel style={{ padding: 28, gap: 20 }}>
        <Type weight="semibold" style={{ fontSize: 24 }}>
          {kind === 'person'
            ? (person.name ?? `Rank ${person.rank}`)
            : editId
              ? 'Edit entry'
              : 'New entry'}
        </Type>
        {kind === 'person' && (
          <Type style={{ fontSize: 12, color: colors.muted }}>
            Calibrate other assets after entering holdings to avoid double-counting. Changes to
            calibration take effect on the next market update.
          </Type>
        )}
        {fields[kind]
          .filter((f) => f.key !== 'initial_estimate_usd' || person.worth == null)
          .map((f) => (
            <TextField key={f.key}>
              <Label>{f.label}</Label>
              {f.date ? (
                <DateField
                  label={f.label}
                  value={form[f.key] ?? ''}
                  onChange={(v) => set(f.key, v)}
                />
              ) : (
                <Input
                  editable={!busy}
                  value={form[f.key] ?? ''}
                  onChangeText={(v) => set(f.key, v)}
                  keyboardType={f.number ? 'decimal-pad' : 'default'}
                  multiline={f.multiline}
                  autoCapitalize={
                    f.key === 'slug' || f.key === 'ticker' || f.key === 'source_url'
                      ? 'none'
                      : 'sentences'
                  }
                  className="rounded-xl"
                  style={f.multiline ? { minHeight: 95, textAlignVertical: 'top' } : undefined}
                />
              )}
            </TextField>
          ))}
        {kind === 'holdings' && (
          <View style={{ gap: 8 }}>
            <Type weight="medium">Company type</Type>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {['false', 'true'].map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={form.is_private === v ? 'primary' : 'secondary'}
                  className="rounded-full"
                  onPress={() => {
                    set('is_private', v);
                    void Haptics.selectionAsync();
                  }}
                >
                  <Button.Label>{v === 'true' ? 'Private' : 'Public'}</Button.Label>
                </Button>
              ))}
            </View>
          </View>
        )}
        {kind === 'projects' && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {['new', 'upcoming'].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={form.status === v ? 'primary' : 'secondary'}
                className="rounded-full"
                onPress={() => {
                  set('status', v);
                  void Haptics.selectionAsync();
                }}
              >
                <Button.Label>{v === 'new' ? 'New' : 'Upcoming · reported'}</Button.Label>
              </Button>
            ))}
          </View>
        )}
        {!!error && <FieldError>{error}</FieldError>}
        {!!message && <Type style={{ color: colors.green }}>{message}</Type>}
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Action
            label={busy ? 'Saving…' : 'Save changes'}
            disabled={busy}
            onPress={() => void save()}
          />
          {editId && kind !== 'person' && (
            <Action
              label={confirm ? 'Confirm delete' : 'Delete'}
              secondary
              disabled={busy}
              onPress={() => void remove()}
            />
          )}
        </View>
      </Panel>
      <Panel style={{ padding: 28, gap: 15 }}>
        <Type weight="semibold" style={{ fontSize: 20 }}>
          Market updates.
        </Type>
        <Type style={{ color: colors.muted, fontSize: 13 }}>
          Updates run only while the US market is open. Automatic 15-minute updates require an
          external scheduler.
        </Type>
        <Action
          label={busy ? 'Please wait…' : 'Update market prices'}
          disabled={busy}
          onPress={() => void updateMarket()}
        />
      </Panel>
    </View>
  );
}
