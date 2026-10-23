import { router } from 'expo-router';

import { Body, Button, Heading, Screen } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen>
      <Heading>Page not found.</Heading>
      <Body secondary>That page doesn’t exist or has moved.</Body>
      <Button label="Back to Rankings" onPress={() => router.replace('/')} />
    </Screen>
  );
}
