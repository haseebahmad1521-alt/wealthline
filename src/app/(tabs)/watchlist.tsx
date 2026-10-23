import { router } from 'expo-router';
import { View } from 'react-native';

import { PersonList } from '@/components/person-row';
import { Body, Button, Heading, Screen, StateView } from '@/components/ui';
import { usePeople, useWatchlist } from '@/lib/data';
import { color } from '@/theme';

export default function Watchlist() {
  const watch = useWatchlist();
  const people = usePeople();
  const watched = (people.data ?? []).filter((p) => watch.ids.includes(p.id));
  const pending = people.isPending || (watch.signedIn && watch.isPending);
  const error = people.error ?? (watch.signedIn ? watch.error : null);

  return (
    <Screen>
      <View>
        <Heading>Watchlist.</Heading>
        <Body secondary>Private to your account. Only you can see it.</Body>
      </View>
      {!watch.signedIn ? (
        <StateView
          empty={{
            title: 'Sign in to keep a watchlist.',
            body: 'Watchlists are private to your account, so we need to know it’s you.',
            action: <Button label="Sign in" onPress={() => router.push('/account')} />,
          }}
        />
      ) : (
        <>
          {watch.actionError && <Body style={{ color: color.loss }}>{watch.actionError}</Body>}
          {pending || error ? (
            <StateView
              loading={pending}
              error={error}
              onRetry={() => {
                void people.refetch();
                void watch.refetch();
              }}
            />
          ) : watched.length === 0 ? (
            <StateView empty={{ title: 'Nothing watched yet.', body: 'Tap the star on a profile to add someone here.' }} />
          ) : (
            <PersonList people={watched} />
          )}
          <Button label="Manage account" variant="secondary" onPress={() => router.push('/account')} />
        </>
      )}
    </Screen>
  );
}
