import { router, Stack } from 'expo-router';
import { Page, Empty } from '@/components/wealthline-ui';
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Page>
        <Empty
          title="This page could not be found."
          label="Back to rankings"
          action={() => router.replace('/')}
        />
      </Page>
    </>
  );
}
