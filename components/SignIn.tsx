import { useState } from 'react';
import { View } from 'react-native';
import { TextField, Label, Input, FieldError } from 'heroui-native';
import * as Haptics from 'expo-haptics';
import { bilt } from '@/lib/bilt';
import { Action, Type, Panel } from '@/components/wealthline-ui';
import { colors } from '@/lib/wealthline-theme';
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email) || (sent && !/^\d{6}$/.test(code))) {
      setError(sent ? 'Enter the 6-digit code from your email.' : 'Enter a valid email address.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setPending(true);
    try {
      const r = sent
        ? await bilt.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
        : await bilt.auth.signInWithOtp({ email: email.trim() });
      if (r.error) throw r.error;
      if (!sent) setSent(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError(
        sent
          ? 'That code could not be verified. Try again or request a new code.'
          : 'Could not send your sign-in code. Try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Panel style={{ maxWidth: 460, width: '100%', padding: 30, gap: 22 }}>
      <Type weight="semibold" style={{ fontSize: 26, lineHeight: 32 }}>
        Your own view of wealth.
      </Type>
      <Type style={{ color: colors.muted }}>Sign in to follow the people you want to watch.</Type>
      <TextField isInvalid={!!error}>
        <Label>Email</Label>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          editable={!sent && !pending}
          placeholder="you@example.com"
          className="rounded-xl"
        />
      </TextField>
      {sent && (
        <TextField isInvalid={!!error}>
          <Label>Sign-in code</Label>
          <Input
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            className="rounded-xl"
          />
          <Type style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
            Check your inbox for a code.
          </Type>
        </TextField>
      )}
      {!!error && <FieldError>{error}</FieldError>}
      <Action
        label={pending ? 'Please wait…' : sent ? 'Verify and sign in' : 'Send sign-in code'}
        onPress={() => void submit()}
        disabled={pending}
      />
      {sent && (
        <View>
          <Action
            secondary
            label="Use another email or resend"
            disabled={pending}
            onPress={() => {
              setSent(false);
              setCode('');
              setError('');
            }}
          />
        </View>
      )}
    </Panel>
  );
}
