import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAuth, usePeople, useWatchlist } from '@/lib/wealthline';
import { bilt } from '@/lib/bilt';
import SignIn from '@/components/SignIn';
import {
  Page,
  Type,
  Panel,
  PersonRow,
  DataState,
  Empty,
  Action,
  FollowButton,
} from '@/components/wealthline-ui';
export default function Watchlist() {
  const auth = useAuth();
  const people = usePeople();
  const watch = useWatchlist();
  const { width } = useWindowDimensions();
  const rows = people.data?.filter((p) => watch.data?.includes(p.id)) ?? [];
  return (
    <Page>
      <View
        style={{
          paddingTop: 50,
          paddingBottom: 34,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Type
          weight="bold"
          style={{ fontSize: width >= 800 ? 56 : 38, lineHeight: 64, letterSpacing: -2 }}
        >
          Your watchlist.
        </Type>
        {auth.user && (
          <Action secondary small label="Sign out" onPress={() => void bilt.auth.signOut()} />
        )}
      </View>
      {auth.loading ? (
        <DataState loading error={false} retry={() => undefined} />
      ) : !auth.user ? (
        <SignIn />
      ) : (
        <>
          <DataState
            loading={watch.isPending || people.isPending}
            error={watch.isError || people.isError}
            retry={() => {
              void watch.refetch();
              void people.refetch();
            }}
          />
          {!watch.isPending &&
            !people.isPending &&
            !watch.isError &&
            !people.isError &&
            (rows.length ? (
              <Panel style={{ paddingHorizontal: width >= 800 ? 30 : 18 }}>
                {rows.map((p) => (
                  <Animated.View entering={FadeIn} exiting={FadeOut} key={p.id}>
                    <PersonRow person={p} />
                    <View style={{ paddingVertical: 10, alignItems: 'flex-end' }}>
                      <FollowButton person={p} />
                    </View>
                  </Animated.View>
                ))}
              </Panel>
            ) : (
              <Empty title="Follow people to see their fortunes here." />
            ))}
        </>
      )}
    </Page>
  );
}
