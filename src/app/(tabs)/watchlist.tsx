import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { PersonList } from '@/components/person-row';
import { Body, Button, Caption, Heading, Icon, Screen, StateView, Surface, icons, minTouch } from '@/components/ui';
import { usePeople, useWatchlist } from '@/lib/data';
import { sortLabels } from '@/lib/view-params';
import { useSavedViews, type SavedView } from '@/lib/views';
import { color, space, type } from '@/theme';

function describe(v: SavedView) {
  if (v.target === 'projects') return `Projects · ${v.params.status === 'all' ? 'all' : v.params.status}`;
  return `Rankings · ${v.params.q ? `“${v.params.q}”, ` : ''}by ${sortLabels[v.params.sort].toLowerCase()}`;
}

export default function Watchlist() {
  const watch = useWatchlist();
  const people = usePeople();
  const views = useSavedViews();
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
          <Heading level={2}>Saved views.</Heading>
          {views.error ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Body style={{ color: color.loss }}>Could not load your saved views. {views.error.message}</Body>
            </View>
          ) : views.isPending ? (
            <Caption>Loading saved views…</Caption>
          ) : (views.data ?? []).length === 0 ? (
            <Body secondary>Save a filter or sort from Rankings or Projects and it appears here.</Body>
          ) : (
            <Surface>
              {views.data!.map((v) => (
                <Pressable
                  key={v.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${v.name}, ${describe(v)}, opens ${v.target === 'people' ? 'rankings' : v.target}`}
                  onPress={() => router.push(v.target === 'people' ? `/?view=${v.id}` : `/projects?view=${v.id}`)}
                  style={{ minHeight: minTouch, padding: space.md, gap: 2, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: color.text }]}>{v.name}</Text>
                    <Caption>{describe(v)}</Caption>
                  </View>
                  <Icon name={icons.chevron} size={14} tint={color.textSecondary} />
                </Pressable>
              ))}
            </Surface>
          )}
          <Button label="Manage account" variant="secondary" onPress={() => router.push('/account')} />
        </>
      )}
    </Screen>
  );
}
