import { View } from 'react-native';

import { PersonList as List } from '@/components/person-row';
import { Body, Heading, Screen, StateView } from '@/components/ui';
import { usePeople } from '@/lib/data';

export default function Rankings() {
  const people = usePeople();
  const ranked = people.data?.filter((p) => p.rank != null) ?? [];
  const pending = people.data?.filter((p) => p.rank == null) ?? [];

  return (
    <Screen>
      <View>
        <Heading>Rankings.</Heading>
        <Body secondary>The world’s biggest fortunes. In motion.</Body>
      </View>
      {people.isPending || people.error ? (
        <StateView loading={people.isPending} error={people.error} onRetry={() => void people.refetch()} />
      ) : ranked.length === 0 && pending.length === 0 ? (
        <StateView empty={{ title: 'No one ranked yet.', body: 'Estimates appear here once they’ve been sourced and entered.' }} />
      ) : (
        <>
          {ranked.length > 0 && <List people={ranked} />}
          {pending.length > 0 && (
            <>
              <Heading level={2}>Awaiting estimates.</Heading>
              <Body secondary>Not ranked until a sourced estimate is recorded.</Body>
              <List people={pending} showRank={false} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
