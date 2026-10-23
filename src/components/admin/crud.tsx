import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Body, Button, Caption, Heading, Icon, icons, minTouch, StateView } from '@/components/ui';
import { db } from '@/lib/supabase';
import { color, font, radius, space, type } from '@/theme';

export type Row = { id: string } & Record<string, unknown>;
type Values = Record<string, string>;

export type Field = {
  key: string;
  label: string;
  kind: 'text' | 'slug' | 'url' | 'int' | 'num' | 'billions' | 'date' | 'utc' | 'choice' | 'bool';
  req?: boolean | ((v: Values) => boolean);
  hint?: string;
  multi?: boolean;
  min?: number;
  max?: number;
  choices?: string[];
};

// ---- validation ----------------------------------------------------------------------------

const isDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Empty optional fields become null; nothing is ever defaulted or invented. */
export function parse(fields: Field[], v: Values) {
  const errors: Record<string, string> = {};
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (v[f.key] ?? '').trim();
    if (f.kind === 'bool') {
      payload[f.key] = raw === 'true';
      continue;
    }
    const required = typeof f.req === 'function' ? f.req(v) : f.req;
    if (!raw) {
      if (required) errors[f.key] = 'Required.';
      else payload[f.key] = null;
      continue;
    }
    let err = '';
    let out: unknown = raw;
    if (f.kind === 'slug' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw)) err = 'Use lowercase letters, numbers and single hyphens, like jane-doe.';
    else if (f.kind === 'url' && !isHttpUrl(raw)) err = 'Enter a full http:// or https:// link.';
    else if (f.kind === 'date' || f.kind === 'utc') {
      if (!isDate(raw)) err = 'Use a real date as YYYY-MM-DD.';
      else if (f.kind === 'utc') out = `${raw}T00:00:00.000Z`;
    } else if (f.kind === 'int' || f.kind === 'num' || f.kind === 'billions') {
      const ok = f.kind === 'int' ? /^\d+$/.test(raw) : /^\d+(\.\d+)?$/.test(raw);
      const n = Number(raw);
      if (!ok) err = f.kind === 'int' ? 'Enter a whole number.' : 'Enter a number, 0 or more.';
      else if (f.min != null && n < f.min) err = `Must be at least ${f.min}.`;
      else if (f.max != null && n > f.max) err = `Must be at most ${f.max}.`;
      else out = f.kind === 'billions' ? Math.round(n * 1e9) : n;
    } else if (f.kind === 'choice' && !f.choices?.includes(raw)) err = 'Choose one.';
    if (err) errors[f.key] = err;
    else payload[f.key] = out;
  }
  return { errors, payload };
}

function initial(fields: Field[], row?: Row | null): Values {
  const v: Values = {};
  for (const f of fields) {
    const x = row?.[f.key];
    v[f.key] =
      x == null ? (f.kind === 'bool' ? 'false' : '')
      : f.kind === 'utc' ? String(x).slice(0, 10)
      : f.kind === 'billions' ? String(Number(x) / 1e9)
      : String(x);
  }
  return v;
}

// ---- mutation plumbing ---------------------------------------------------------------------

type Result = { error: { message: string } | null; data?: unknown };

export function useWrite(invalidate: unknown[][]) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(op: () => PromiseLike<Result>) {
    setPending(true);
    setError(null);
    let ok = false;
    try {
      const r = await op();
      if (r.error) setError(r.error.message);
      else ok = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
    // Refetch even after a failure, so the screen shows what the server really holds.
    await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
    setPending(false);
    return ok;
  }
  return { run, pending, error };
}

export function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[type.caption, styles.error]}>
      {children}
    </Text>
  );
}

// ---- form ----------------------------------------------------------------------------------

function FieldRow({ f, value, error, onChange }: { f: Field; value: string; error?: string; onChange: (s: string) => void }) {
  const required = typeof f.req === 'function' ? f.req({ [f.key]: value }) : f.req;
  return (
    <View style={styles.fieldRow}>
      <Text style={[type.caption, styles.label]}>{f.label}{f.req === true ? ' (required)' : ''}</Text>
      {f.hint ? <Caption>{f.hint}</Caption> : null}
      {f.kind === 'bool' ? (
        <Switch
          value={value === 'true'}
          onValueChange={(on) => onChange(String(on))}
          accessibilityLabel={f.label}
          trackColor={{ true: color.action }}
          style={styles.switch}
        />
      ) : f.kind === 'choice' ? (
        <View style={styles.choices} accessibilityRole="radiogroup">
          {f.choices!.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={`${f.label}: ${c}`}
              accessibilityState={{ selected: value === c }}
              onPress={() => onChange(c)}
              style={[styles.chip, value === c && styles.chipOn]}>
              <Text style={[type.headline, { color: value === c ? color.surface : color.text }]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          accessibilityLabel={f.label}
          accessibilityHint={required ? 'Required' : undefined}
          multiline={f.multi}
          autoCapitalize={f.kind === 'text' ? 'sentences' : 'none'}
          autoCorrect={f.kind === 'text'}
          keyboardType={f.kind === 'url' ? 'url' : f.kind === 'int' ? 'number-pad' : f.kind === 'num' || f.kind === 'billions' ? 'decimal-pad' : f.kind === 'date' || f.kind === 'utc' ? 'numbers-and-punctuation' : 'default'}
          placeholderTextColor={color.textSecondary}
          style={[styles.input, f.multi && styles.inputMulti]}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

export function RecordForm({
  fields, row, table, extra, invalidate, submitLabel, onDone, onCancel,
}: {
  fields: Field[];
  row?: Row | null;
  table: string;
  extra?: Record<string, unknown>;
  invalidate: unknown[][];
  submitLabel: string;
  onDone: (id: string | null) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(() => initial(fields, row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending, error } = useWrite(invalidate);

  async function submit() {
    const { errors: e, payload } = parse(fields, values);
    setErrors(e);
    if (Object.keys(e).length) return;
    let id: string | null = row?.id ?? null;
    const ok = await run(async () => {
      const q = row
        ? db().from(table).update(payload).eq('id', row.id)
        : db().from(table).insert({ ...payload, ...extra });
      const r = await q.select('id').single();
      if (!r.error) id = (r.data as { id: string }).id;
      return r;
    });
    if (ok) onDone(id);
  }

  const n = Object.keys(errors).length;
  return (
    <View style={styles.formWrap}>
      <View style={styles.group}>
        {fields.map((f, i) => (
          <View key={f.key} style={i > 0 && styles.sep}>
            <FieldRow f={f} value={values[f.key]} error={errors[f.key]} onChange={(s) => setValues((v) => ({ ...v, [f.key]: s }))} />
          </View>
        ))}
      </View>
      {n > 0 && <ErrorText>{`Fix ${n} ${n === 1 ? 'field' : 'fields'} above to save.`}</ErrorText>}
      <ErrorText>{error ? `Could not save: ${error}` : null}</ErrorText>
      <View style={styles.actions}>
        <Button label={submitLabel} onPress={() => void submit()} loading={pending} />
        {onCancel && <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={pending} />}
      </View>
    </View>
  );
}

// ---- list + add/edit/delete section --------------------------------------------------------

export function Crud({
  title, noun, table, fields, rows, personId, invalidate, describe, canEdit = true, canDelete, intro,
}: {
  title: string;
  noun: string;
  table: string;
  fields: Field[];
  rows: { data?: Row[]; isPending: boolean; error: unknown; refetch: () => unknown };
  personId: string;
  invalidate: unknown[][];
  describe: (r: Row) => { title: string; sub: string };
  canEdit?: boolean;
  canDelete?: (r: Row) => boolean;
  intro?: ReactNode;
}) {
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const del = useWrite(invalidate);

  async function remove(r: Row) {
    if (!(await confirm(`Delete this ${noun}?`, describe(r).title))) return;
    await del.run(async () => {
      const res = await db().from(table).delete().eq('id', r.id).select('id');
      if (!res.error && !res.data?.length) return { error: { message: 'Nothing was deleted. This account may not have permission.' } };
      return res;
    });
  }

  return (
    <View style={styles.section}>
      <Heading level={2}>{title}</Heading>
      {intro}
      {rows.isPending || rows.error ? (
        <StateView loading={rows.isPending} error={rows.error} onRetry={() => void rows.refetch()} />
      ) : rows.data?.length ? (
        <View style={styles.group}>
          {rows.data.map((r, i) => {
            const d = describe(r);
            return (
              <View key={r.id} style={[styles.listRow, i > 0 && styles.sep]}>
                <Pressable
                  disabled={!canEdit}
                  onPress={() => setEditing(r)}
                  accessibilityRole={canEdit ? 'button' : 'text'}
                  accessibilityLabel={canEdit ? `Edit ${d.title}, ${d.sub}` : `${d.title}, ${d.sub}`}
                  style={styles.listMain}>
                  <Text style={[type.headline, { color: color.text }]}>{d.title}</Text>
                  <Caption>{d.sub}</Caption>
                </Pressable>
                {(canDelete?.(r) ?? true) && (
                  <Pressable
                    onPress={() => void remove(r)}
                    disabled={del.pending}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${d.title}`}
                    style={[styles.iconBtn, del.pending && { opacity: 0.45 }]}>
                    <Icon name={icons.close} size={18} tint={color.loss} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <Body secondary>{`No ${noun}s recorded.`}</Body>
      )}
      <ErrorText>{del.error ? `Could not delete: ${del.error}` : null}</ErrorText>
      {editing ? (
        <RecordForm
          key={editing === 'new' ? 'new' : editing.id}
          fields={fields}
          row={editing === 'new' ? null : editing}
          table={table}
          extra={{ person_id: personId }}
          invalidate={invalidate}
          submitLabel={editing === 'new' ? `Add ${noun}` : 'Save changes'}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button label={`Add ${noun}`} icon={icons.plus} variant="secondary" onPress={() => setEditing('new')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  formWrap: { gap: space.md },
  group: { backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  fieldRow: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  label: { color: color.textSecondary },
  input: {
    minHeight: minTouch,
    ...type.body,
    color: color.text,
    paddingVertical: space.sm,
  },
  inputMulti: { minHeight: 96, textAlignVertical: 'top' },
  switch: { alignSelf: 'flex-start', marginVertical: space.sm },
  choices: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  chip: { minHeight: minTouch, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.action },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  error: { color: color.loss, fontFamily: font.medium },
  listRow: { flexDirection: 'row', alignItems: 'center' },
  listMain: { flex: 1, minHeight: minTouch, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: 'center', gap: 2 },
  iconBtn: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
});
