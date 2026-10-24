import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Heading, Icon, Surface } from '@/components/ui';
import { install } from '@/lib/install';
import { color, space, type } from '@/theme';

const share = { ios: 'square.and.arrow.up', android: 'ios_share', web: 'ios_share' };
const add = { ios: 'plus.app', android: 'add_box', web: 'add_box' };

/** Offers installing the web app to the home screen; renders nothing on native or once installed. */
export function InstallCard() {
  const canPrompt = useSyncExternalStore(install.subscribe, install.canPrompt, () => false);
  if (install.standalone()) return null;
  const ios = install.isIOS();
  if (!ios && !canPrompt) return null;

  return (
    <Surface style={styles.card}>
      <Heading level={2}>Add to Home Screen.</Heading>
      <Body secondary>Open Wealthline full screen from your home screen, like an app.</Body>
      {canPrompt ? (
        <Button label="Install Wealthline" onPress={() => void install.prompt()} />
      ) : (
        <View style={styles.steps} accessibilityRole="list">
          <Step n={1} icon={share} text="Tap Share in Safari’s toolbar." />
          <Step n={2} icon={add} text="Choose “Add to Home Screen”, then Add." />
        </View>
      )}
    </Surface>
  );
}

function Step({ n, icon, text }: { n: number; icon: typeof share; text: string }) {
  return (
    <View style={styles.step} accessibilityLabel={`Step ${n}: ${text}`}>
      <View style={styles.stepIcon}>
        <Icon name={icon} size={18} tint={color.action} />
      </View>
      <Text style={[type.body, { color: color.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md },
  steps: { gap: space.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: color.actionTint, alignItems: 'center', justifyContent: 'center' },
});
