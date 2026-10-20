import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  Linking,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { Button, Skeleton, PressableFeedback } from 'heroui-native';
import { Link, router, usePathname } from 'expo-router';
import {
  ArrowUpRight,
  Bookmark,
  ChartNoAxesCombined,
  ChevronRight,
  ExternalLink,
  Inbox,
  RefreshCw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, money, dateLabel } from '@/lib/wealthline-theme';
import {
  useAuth,
  useHistory,
  useWatchlist,
  type Person,
  type Project,
  type ChartRange,
} from '@/lib/wealthline';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WealthChart from '@/components/WealthChart';

export function Type({
  children,
  style,
  weight = 'regular',
  ...props
}: TextProps & { weight?: keyof typeof fonts }) {
  return (
    <Text
      {...props}
      style={[
        { fontFamily: fonts[weight], color: colors.text, fontSize: 14, lineHeight: 21 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Button
      onPress={onPress}
      isDisabled={disabled}
      variant={secondary ? 'secondary' : 'primary'}
      size={small ? 'sm' : 'md'}
      className={`rounded-full ${secondary ? 'bg-field' : ''}`}
    >
      <Button.Label
        style={{
          fontFamily: fonts.medium,
          fontSize: small ? 12 : 14,
          color: secondary ? colors.text : colors.surface,
        }}
      >
        {label}
      </Button.Label>
    </Button>
  );
}
export function Panel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Type weight="semibold" style={{ fontSize: 30, lineHeight: 38, letterSpacing: -1 }}>
        {children}
      </Type>
      {action}
    </View>
  );
}
export function Stamp({ at, short = false }: { at?: string | null; short?: boolean }) {
  return (
    <Type style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>
      {short ? 'Updated' : 'Last updated'} {dateLabel(at)}
    </Type>
  );
}
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        height: size,
        width: size,
        borderRadius: size / 2,
        backgroundColor: colors.text,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Type weight="medium" style={{ fontSize: size * 0.31, color: colors.surface }}>
        {name
          .split(' ')
          .map((x) => x[0])
          .slice(0, 2)
          .join('')}
      </Type>
    </View>
  );
}
export function Delta({
  value,
  percent,
  large = false,
}: {
  value: number | null;
  percent?: number | null;
  large?: boolean;
}) {
  return (
    <Type
      weight="medium"
      style={{
        color: value == null ? colors.muted : value >= 0 ? colors.green : colors.red,
        fontSize: large ? 17 : 13,
      }}
    >
      {value == null
        ? '—'
        : `${value >= 0 ? '▲' : '▼'} ${money(Math.abs(value))}${percent != null ? ` (${Math.abs(percent).toFixed(1)}%)` : ''}`}
    </Type>
  );
}
const nav = [
  { name: 'Rankings', href: '/' },
  { name: 'People', href: '/people' },
  { name: 'Projects', href: '/projects' },
  { name: 'Watchlist', href: '/watchlist' },
] as const;
export function Page({
  children,
  wide = true,
  scrollable = true,
}: {
  children: React.ReactNode;
  wide?: boolean;
  scrollable?: boolean;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const path = usePathname();
  const { user, isAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  const content = (
    <>
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <View style={[styles.nav, { paddingHorizontal: width >= 1168 ? 0 : 22 }]}>
          <Link href="/" accessibilityLabel="Wealthline home">
            <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center' }}>
              <ChartNoAxesCombined size={24} color={colors.text} strokeWidth={2} />
              <Type weight="bold" style={{ fontSize: 21, letterSpacing: -0.8 }}>
                wealthline
              </Type>
            </View>
          </Link>
          {desktop && (
            <View style={{ flexDirection: 'row', gap: 32, alignItems: 'center' }}>
              {nav.map((n) => (
                <Link
                  key={n.name}
                  href={n.href}
                  onPress={() => {
                    if (path !== n.href) void Haptics.selectionAsync();
                  }}
                >
                  <Type
                    weight={path === n.href ? 'semibold' : 'regular'}
                    style={{ color: path === n.href ? colors.text : colors.muted, fontSize: 13 }}
                  >
                    {n.name}
                  </Type>
                </Link>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {isAdmin && (
              <Link href="/admin">
                <Type style={{ fontSize: 12, color: colors.blue }}>Admin</Type>
              </Link>
            )}
            {desktop ? (
              <Action
                small
                label={user ? 'My watchlist' : 'Sign in'}
                onPress={() => router.push('/watchlist')}
                secondary
              />
            ) : (
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                onPress={() => router.push('/watchlist')}
                accessibilityLabel="Open watchlist"
              >
                <Bookmark size={19} color={colors.text} />
              </Button>
            )}
          </View>
        </View>
      </View>
      <View
        style={{
          width: '100%',
          maxWidth: wide ? 1120 : 760,
          alignSelf: 'center',
          paddingHorizontal: width >= 1168 ? 0 : desktop ? 24 : 20,
          paddingBottom: scrollable ? 58 : 0,
          flex: scrollable ? undefined : 1,
          minHeight: 0,
        }}
      >
        {children}
      </View>
      <View
        style={{
          marginTop: 'auto',
          borderTopWidth: 1,
          borderColor: colors.border,
          paddingVertical: 30,
          paddingHorizontal: 20,
        }}
      >
        <View
          style={{
            maxWidth: 1120,
            width: '100%',
            alignSelf: 'center',
            gap: 14,
            flexDirection: desktop ? 'row' : 'column',
            justifyContent: 'space-between',
          }}
        >
          <Type style={{ color: colors.muted, fontSize: 11 }}>
            Net worth figures are estimates and are not income. Not investment advice.
          </Type>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Type style={{ color: colors.muted, fontSize: 11 }}>
              © {new Date().getFullYear()} Wealthline
            </Type>
            <Link href="/admin">
              <Type style={{ color: colors.muted, fontSize: 11 }}>Admin</Type>
            </Link>
          </View>
        </View>
      </View>
    </>
  );
  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS !== 'web' && !path.startsWith('/person/') ? insets.top : 0,
      }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {scrollable ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}
    </KeyboardAvoidingView>
  );
}
export function Empty({
  title,
  action,
  label = 'Explore people',
}: {
  title: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 18 }}>
      <Inbox size={30} color={colors.muted} />
      <Type style={{ textAlign: 'center', color: colors.muted }}>{title}</Type>
      <Action secondary label={label} onPress={action ?? (() => router.push('/people'))} />
    </View>
  );
}
export function DataState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  useEffect(() => {
    if (error) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [error]);
  if (error)
    return (
      <View style={{ paddingVertical: 40, gap: 18, alignItems: 'center' }}>
        <RefreshCw color={colors.red} />
        <Type>Could not load the latest estimates.</Type>
        <Action label="Try again" onPress={retry} />
      </View>
    );
  if (loading)
    return (
      <View style={{ gap: 20, paddingVertical: 30 }}>
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <Skeleton className="h-80 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </View>
    );
  return null;
}
export function FollowButton({ person }: { person: Person }) {
  const auth = useAuth();
  const watch = useWatchlist();
  const saved = watch.data?.includes(person.id);
  return (
    <View style={{ gap: 5 }}>
      <Button
        accessibilityLabel={saved ? `Unfollow ${person.name}` : `Follow ${person.name}`}
        variant="secondary"
        size="sm"
        className="bg-field rounded-full"
        isDisabled={watch.pending === person.id}
        onPress={() => {
          if (!auth.user) router.push('/watchlist');
          else void watch.toggle(person.id);
        }}
      >
        <Bookmark size={15} fill={saved ? colors.text : 'none'} color={colors.text} />
        <Button.Label style={{ fontSize: 12 }}>
          {watch.pending === person.id ? 'Saving…' : saved ? 'Following' : 'Follow'}
        </Button.Label>
      </Button>
      {!!watch.actionError && (
        <Type style={{ color: colors.red, fontSize: 11 }}>{watch.actionError}</Type>
      )}
    </View>
  );
}
export function FortuneCard({ person, profile = false }: { person: Person; profile?: boolean }) {
  const [range, setRange] = useState<ChartRange>('1M');
  const history = useHistory(person, range);
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  return (
    <Panel style={{ padding: desktop ? 32 : 22 }}>
      {!profile && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 27,
          }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 13, flex: 1, minWidth: 0 }}
          >
            <Avatar name={person.name ?? ''} size={width < 380 ? 36 : 48} />
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}
              >
                <Type weight="semibold" style={{ fontSize: width < 380 ? 15 : 18 }}>
                  {person.name}
                </Type>
                <View
                  style={{
                    borderRadius: 5,
                    paddingHorizontal: 6,
                    backgroundColor: colors.soft,
                    alignSelf: 'flex-start',
                  }}
                >
                  <Type style={{ fontSize: 11, color: colors.muted }}>No. {person.rank}</Type>
                </View>
              </View>
              <Type style={{ color: colors.muted, fontSize: 12 }}>{person.main_source}</Type>
            </View>
          </View>
          <Button
            variant="tertiary"
            isIconOnly={!desktop}
            size="sm"
            className="rounded-full"
            onPress={() =>
              router.push({ pathname: '/person/[slug]', params: { slug: person.slug } })
            }
            accessibilityLabel={`View ${person.name}`}
          >
            <Button.Label style={{ color: colors.blue, fontSize: 12 }}>
              {desktop ? 'View profile' : ''}
            </Button.Label>
            <ArrowUpRight size={18} color={colors.blue} />
          </Button>
        </View>
      )}
      <View
        style={{
          flexDirection: desktop ? 'row' : 'column',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 22,
        }}
      >
        <View>
          <Type style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>
            Estimated net worth
          </Type>
          <View
            style={{
              flexDirection: desktop ? 'row' : 'column',
              alignItems: desktop ? 'center' : 'flex-start',
              gap: desktop ? 22 : 5,
            }}
          >
            <Type
              weight="bold"
              style={{
                fontSize: desktop ? 56 : 46,
                lineHeight: desktop ? 66 : 56,
                letterSpacing: -2.5,
              }}
            >
              {money(person.worth)}
            </Type>
            <View>
              <Delta
                value={person.change}
                percent={person.monthWorth ? (person.change! / person.monthWorth) * 100 : null}
              />
              <Type style={{ fontSize: 11, color: colors.muted }}>over the last month</Type>
            </View>
          </View>
          <Stamp at={person.asOf} />
        </View>
        <View
          style={{
            alignSelf: desktop ? 'center' : 'flex-start',
            flexDirection: 'row',
            padding: 4,
            borderRadius: 30,
            backgroundColor: colors.soft,
          }}
        >
          {(['1D', '1M', 'YTD', 'All'] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant="tertiary"
              className="rounded-full"
              style={{
                backgroundColor: range === r ? colors.surface : 'transparent',
                minWidth: 48,
                height: 32,
              }}
              onPress={() => {
                setRange(r);
                void Haptics.selectionAsync();
              }}
            >
              <Button.Label
                style={{ fontSize: 12, color: range === r ? colors.text : colors.muted }}
              >
                {r}
              </Button.Label>
            </Button>
          ))}
        </View>
      </View>
      {history.isPending ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : history.isError ? (
        <DataState loading={false} error retry={() => void history.refetch()} />
      ) : history.data?.length ? (
        <WealthChart points={history.data} height={profile ? 320 : 235} />
      ) : (
        <Empty
          title="No recorded estimates in this range."
          label="View all history"
          action={() => setRange('All')}
        />
      )}
      <View
        style={{
          borderTopWidth: 1,
          borderColor: colors.border,
          marginTop: 14,
          paddingTop: 15,
          flexDirection: desktop ? 'row' : 'column',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <Type style={{ fontSize: 11, color: colors.muted }}>
          Recorded estimates · {history.data?.length ?? 0}{' '}
          {(history.data?.length ?? 0) === 1 ? 'observation' : 'observations'}
        </Type>
        <Type style={{ fontSize: 11, color: colors.muted }}>
          October seed figures supplied by owner
        </Type>
      </View>
    </Panel>
  );
}
export function PersonRow({ person, showSource = true }: { person: Person; showSource?: boolean }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  return (
    <PressableFeedback
      onPress={() => router.push({ pathname: '/person/[slug]', params: { slug: person.slug } })}
      isDisabled={!person.name}
      accessibilityLabel={
        person.name ? `View ${person.name}` : `Rank ${person.rank} awaiting entry`
      }
      style={{ width: '100%' }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: desktop ? 22 : 12,
          paddingVertical: 19,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Type
          weight="medium"
          style={{ width: desktop ? 26 : 18, color: colors.muted, fontSize: 13 }}
        >
          {person.rank}
        </Type>
        {person.name ? (
          <Avatar name={person.name} size={desktop ? 40 : 36} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.soft }} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Type weight="semibold" style={{ fontSize: desktop ? 15 : 13 }}>
            {person.name ?? 'Awaiting entry'}
          </Type>
          {!desktop && (
            <Type style={{ color: colors.muted, fontSize: 11 }}>
              {person.main_source ?? 'Not yet published'}
            </Type>
          )}
        </View>
        {desktop && showSource && (
          <Type style={{ width: 210, color: colors.muted, fontSize: 13 }}>
            {person.main_source ?? '—'}
          </Type>
        )}
        <View style={{ width: desktop ? 160 : 114, alignItems: 'flex-end' }}>
          <Type weight="semibold" style={{ fontSize: desktop ? 18 : 16 }}>
            {money(person.worth)}
          </Type>
          {desktop ? (
            <Stamp at={person.asOf} />
          ) : (
            <>
              <Delta value={person.change} />
              <Type style={{ fontSize: 11, lineHeight: 15, color: colors.muted }}>
                Updated{' '}
                {person.asOf
                  ? new Date(person.asOf).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </Type>
            </>
          )}
        </View>
        {desktop && (
          <View style={{ width: 135, alignItems: 'flex-end' }}>
            <Delta value={person.change} />
            <Stamp at={person.asOf} />
          </View>
        )}
        {desktop && <ChevronRight size={16} color={colors.muted} />}
      </View>
    </PressableFeedback>
  );
}
export function ProjectCard({ project, person }: { project: Project; person?: Person }) {
  return (
    <Panel style={{ padding: 26, gap: 15 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Type style={{ fontSize: 12, color: colors.muted }}>{person?.name ?? 'Project'}</Type>
        </View>
        <View
          style={{
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: project.status === 'new' ? colors.greenSoft : colors.amberSoft,
          }}
        >
          <Type
            numberOfLines={1}
            weight="medium"
            style={{ fontSize: 11, color: project.status === 'new' ? colors.green : colors.amber }}
          >
            {project.status === 'new' ? 'New' : 'Upcoming · reported'}
          </Type>
        </View>
      </View>
      <Type weight="semibold" style={{ fontSize: 20, lineHeight: 27 }}>
        {project.title}
      </Type>
      {!!project.description && (
        <Type style={{ color: colors.muted, lineHeight: 23 }}>{project.description}</Type>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Type style={{ fontSize: 11, color: colors.muted }}>
          {new Date(project.announced_date + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Type>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => void Linking.openURL(project.source_url)}
        >
          <Button.Label style={{ fontSize: 12, color: colors.blue }}>
            {project.source_name}
          </Button.Label>
          <ExternalLink size={13} color={colors.blue} />
        </Button>
      </View>
    </Panel>
  );
}
export const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.035,
    shadowRadius: 24,
    elevation: 1,
  },
  nav: {
    maxWidth: 1120,
    width: '100%',
    height: 76,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 62,
    marginBottom: 26,
  },
});
