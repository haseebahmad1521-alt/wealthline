import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { InstallCard } from '@/components/install-card';
import { Body, Button, Caption, Heading, Icon, Screen, Surface, icons, minTouch } from '@/components/ui';
import { resetPassword, passwordRules, signIn, signOut, signUp, verifyDevice } from '@/lib/auth';
import { useCurrencyChoice } from '@/lib/currency';
import { useAuth } from '@/lib/data';
import { color, font, radius, space, type } from '@/theme';

type Mode = 'in' | 'up';
type Step = 'form' | 'code' | 'inbox';

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  onSubmit?: () => void;
  last?: boolean;
  extra?: object;
  trailing?: { label: string; a11y: string; onPress: () => void };
}) {
  return (
    <View style={styles.field}>
      <Text style={[type.caption, { color: color.text }]}>{props.label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={props.label}
          value={props.value}
          onChangeText={props.onChangeText}
          secureTextEntry={props.secure}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={props.last ? 'go' : 'next'}
          onSubmitEditing={props.onSubmit}
          style={styles.input}
          {...props.extra}
        />
        {props.trailing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.trailing.a11y}
            onPress={props.trailing.onPress}
            style={styles.trailing}>
            <Text style={[type.headline, { color: color.action }]}>{props.trailing.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const COMMON = ['USD', 'EUR', 'GBP', 'NOK', 'SEK', 'JPY', 'CHF', 'CAD', 'AUD'];

function CurrencyPicker() {
  const { choice, setChoice, names, rates } = useCurrencyChoice();
  const available = (c: string) => c === 'USD' || !rates || c in rates.rates;
  const [all, setAll] = useState(false);
  const rest = Object.keys(names ?? {}).filter((c) => !COMMON.includes(c)).sort();
  // Common currencies (plus the current choice) by default; the full list on request.
  const shown = all ? [...COMMON, ...rest] : [...COMMON, ...(COMMON.includes(choice) ? [] : [choice])];
  const codes = shown.filter(available);
  return (
    <Surface style={styles.card}>
      <Heading level={2}>Display currency.</Heading>
      <Caption>Values are sourced in US dollars. Conversions use the European Central Bank's daily reference rate.</Caption>
      <View accessibilityRole="radiogroup" accessibilityLabel="Display currency">
        {codes.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === c, selected: choice === c }}
            accessibilityLabel={names?.[c] ? `${names[c]}, ${c}` : c}
            onPress={() => setChoice(c)}
            style={styles.currency}>
            <Text style={[type.headline, { color: color.text, width: 52 }]}>{c}</Text>
            <Text style={[type.body, { color: color.textSecondary, flex: 1 }]} numberOfLines={1}>{names?.[c] ?? ''}</Text>
            {choice === c && <Icon name={icons.check} size={16} tint={color.action} />}
          </Pressable>
        ))}
      </View>
      {rest.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={styles.currency}>
          <Text style={[type.headline, { color: color.action }]}>{all ? 'Show fewer' : 'Show all currencies'}</Text>
        </Pressable>
      )}
    </Surface>
  );
}

export default function Account() {
  const { session, isAdmin } = useAuth();
  const router = useRouter();
  const { verified } = useLocalSearchParams<{ verified?: string }>();
  const [mode, setMode] = useState<Mode>('in');
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const rules = passwordRules(password);
  const strong = rules.every((r) => r.met);
  const cleanEmail = email.trim();
  const emailOk = /^[^\s@]+@[^\s@]+$/.test(cleanEmail);

  const submit = () =>
    run(async () => {
      if (!emailOk) throw new Error('Enter a valid email address.');
      if (mode === 'up') {
        if (!strong) throw new Error('Choose a password that meets every requirement.');
        await signUp(cleanEmail, password);
        setStep('inbox');
      } else {
        if (!password) throw new Error('Enter your password.');
        if ((await signIn(cleanEmail, password)) === 'mfa') setStep('code');
      }
    });

  const resend = () =>
    run(async () => {
      await signIn(cleanEmail, password);
      setNotice('We sent a new code.');
    });

  const confirmCode = () =>
    run(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code.');
      await verifyDevice(cleanEmail, code);
    });

  const forgot = () =>
    run(async () => {
      if (!emailOk) throw new Error('Enter your email above first.');
      await resetPassword(cleanEmail);
      setNotice('If an account exists for that email, a reset link is on its way.');
    });

  const messages = (
    <View accessibilityLiveRegion="polite" style={{ gap: space.sm }}>
      {error && <Text accessibilityRole="alert" style={[type.body, { color: color.loss }]}>{error}</Text>}
      {notice && <Text style={[type.body, { color: color.text }]}>{notice}</Text>}
    </View>
  );

  let content;
  if (session) {
    content = (
      <>
        <Surface style={styles.card}>
          <Heading level={2}>Signed in.</Heading>
          <Body>{session.user.email}</Body>
          <Caption>Signed in on this device</Caption>
          {isAdmin && <Button label="Open admin" variant="secondary" onPress={() => router.push('/admin')} />}
          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </Surface>
        <InstallCard />
      </>
    );
  } else if (step === 'inbox') {
    content = (
      <Surface style={styles.card}>
        <Heading level={2}>Check your inbox.</Heading>
        <Body secondary>
          We sent an activation link to {cleanEmail}. Open it, then come back here to sign in.
        </Body>
        <Button
          label="Back to sign in"
          variant="secondary"
          onPress={() => {
            setStep('form');
            setMode('in');
            setPassword('');
          }}
        />
      </Surface>
    );
  } else if (step === 'code') {
    content = (
      <Surface style={styles.card}>
        <Heading level={2}>Enter your code.</Heading>
        <Body secondary>We sent a code to {cleanEmail} because this is a new device.</Body>
        <Field
          label="6-digit code"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          onSubmit={() => void confirmCode()}
          last
          extra={{ textContentType: 'oneTimeCode', autoComplete: 'one-time-code', keyboardType: 'number-pad', maxLength: 6 }}
        />
        {messages}
        <Button label="Verify" onPress={() => void confirmCode()} loading={busy} />
        <Button label="Resend code" variant="secondary" onPress={() => void resend()} disabled={busy} />
        <Button label="Use a different account" variant="secondary" onPress={() => { setStep('form'); setCode(''); setError(null); }} />
      </Surface>
    );
  } else {
    content = (
      <Surface style={styles.card}>
        <View accessibilityRole="tablist" style={styles.segment}>
          {(['in', 'up'] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => { setMode(m); setError(null); setNotice(null); }}
              style={[styles.segmentItem, mode === m && styles.segmentOn]}>
              <Text style={[type.headline, { color: mode === m ? color.text : color.textSecondary }]}>
                {m === 'in' ? 'Sign in' : 'Create account'}
              </Text>
            </Pressable>
          ))}
        </View>
        {verified === '1' && mode === 'in' && <Body>Email confirmed. Sign in to continue.</Body>}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          extra={{ textContentType: 'emailAddress', autoComplete: 'email', keyboardType: 'email-address' }}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secure={!show}
          last
          onSubmit={() => void submit()}
          extra={{
            textContentType: mode === 'up' ? 'newPassword' : 'password',
            autoComplete: mode === 'up' ? 'new-password' : 'current-password',
          }}
          trailing={{ label: show ? 'Hide' : 'Show', a11y: show ? 'Hide password' : 'Show password', onPress: () => setShow(!show) }}
        />
        {mode === 'up' && (
          <View style={{ gap: 2 }} accessibilityLabel="Password requirements">
            {rules.map((r) => (
              <Caption key={r.label} style={{ color: r.met ? color.gain : color.textSecondary }}>
                {r.met ? 'Met' : 'Needed'}: {r.label}
              </Caption>
            ))}
          </View>
        )}
        {messages}
        <Button label={mode === 'up' ? 'Create account' : 'Sign in'} onPress={() => void submit()} loading={busy} />
        {mode === 'in' && <Button label="Forgot password?" variant="secondary" onPress={() => void forgot()} disabled={busy} />}
      </Surface>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Heading>Account.</Heading>
        <Body secondary>Sign in to keep a private watchlist.</Body>
        {content}
        <CurrencyPicker />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  currency: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: minTouch + 4 },
  field: { gap: space.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    backgroundColor: color.fill,
    paddingHorizontal: space.md,
    minHeight: minTouch + 4,
  },
  input: { flex: 1, minHeight: minTouch, fontFamily: font.regular, fontSize: 16, color: color.text },
  trailing: { minHeight: minTouch, minWidth: minTouch, justifyContent: 'center', alignItems: 'center' },
  segment: { flexDirection: 'row', backgroundColor: color.fill, borderRadius: radius.pill, padding: 3 },
  segmentItem: { flex: 1, minHeight: minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentOn: { backgroundColor: color.surface },
});
