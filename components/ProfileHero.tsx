import { useState } from 'react';
import { Image, Linking, View, useWindowDimensions } from 'react-native';
import { Button, Skeleton } from 'heroui-native';
import * as Haptics from 'expo-haptics';
import { ArrowUpRight, ImageOff } from 'lucide-react-native';
import { Avatar, FollowButton, Type } from '@/components/wealthline-ui';
import { colors } from '@/lib/wealthline-theme';
import { portraits } from '@/lib/portraits';
import type { Person } from '@/lib/wealthline';

export default function ProfileHero({ person }: { person: Person }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const portrait = portraits[person.slug];
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [linkError, setLinkError] = useState(false);
  async function open(url: string) {
    try {
      await Linking.openURL(url);
      setLinkError(false);
    } catch {
      setLinkError(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }
  return (
    <View style={{ marginTop: 22, marginBottom: 28, gap: 10 }}>
      <View
        style={{
          borderRadius: 26,
          overflow: 'hidden',
          backgroundColor: colors.hero,
          flexDirection: desktop ? 'row' : 'column',
        }}
      >
        <View
          style={{
            flex: desktop ? 1.15 : undefined,
            padding: desktop ? 38 : 24,
            justifyContent: 'space-between',
            gap: desktop ? 50 : 22,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <Type weight="semibold" style={{ color: colors.heroInk, fontSize: 14 }}>
              No. {person.rank}
            </Type>
            <FollowButton person={person} />
          </View>
          <View style={{ gap: 14 }}>
            <Type
              weight="bold"
              style={{
                color: colors.heroInk,
                fontSize: desktop ? 58 : 38,
                lineHeight: desktop ? 62 : 42,
                letterSpacing: desktop ? -2.5 : -1.5,
              }}
            >
              {person.name}
            </Type>
            <Type style={{ color: colors.heroInk, fontSize: 15 }}>{person.main_source}</Type>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {person.age != null && (
                <Type style={{ color: colors.heroMuted, fontSize: 12 }}>Age {person.age}</Type>
              )}
              {!!person.residence && (
                <Type style={{ color: colors.heroMuted, fontSize: 12 }}>{person.residence}</Type>
              )}
              {!!person.citizenship && (
                <Type style={{ color: colors.heroMuted, fontSize: 12 }}>{person.citizenship}</Type>
              )}
            </View>
          </View>
        </View>
        <View
          style={{
            flex: desktop ? 1 : undefined,
            height: desktop ? 360 : 300,
            minHeight: desktop ? 360 : 300,
            backgroundColor: colors.heroPhoto,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {portrait && status !== 'error' ? (
            <>
              {status === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
              <Image
                key={`${person.slug}-${attempt}`}
                source={{ uri: portrait.imageUrl }}
                accessibilityLabel={`Portrait of ${person.name}`}
                style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
                resizeMode="cover"
                onLoad={() => setStatus('ready')}
                onError={() => {
                  setStatus('error');
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }}
              />
            </>
          ) : (
            <View style={{ gap: 16, alignItems: 'center' }}>
              <Avatar name={person.name ?? ''} size={76} />
              <ImageOff size={20} color={colors.heroMuted} />
              <Type style={{ color: colors.heroInk }}>Portrait unavailable</Type>
              {portrait && (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setStatus('loading');
                    setAttempt(attempt + 1);
                  }}
                >
                  <Button.Label>Retry photo</Button.Label>
                </Button>
              )}
            </View>
          )}
        </View>
      </View>
      {portrait && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Button
            variant="tertiary"
            size="sm"
            className="rounded-full"
            style={{ backgroundColor: 'transparent', paddingHorizontal: 0, minHeight: 44 }}
            accessibilityLabel={`Photo by ${portrait.author}, source Wikimedia Commons for ${person.name}`}
            onPress={() => void open(portrait.filePage)}
          >
            <Button.Label style={{ fontSize: 11, color: colors.muted }}>
              Photo: {portrait.author}
            </Button.Label>
            <ArrowUpRight size={12} strokeWidth={2} color={colors.muted} />
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            className="rounded-full"
            style={{ backgroundColor: 'transparent', paddingHorizontal: 0, minHeight: 44 }}
            onPress={() => void open(portrait.licenseUrl)}
          >
            <Button.Label style={{ fontSize: 11, color: colors.muted }}>
              {portrait.license}
            </Button.Label>
          </Button>
          <Type style={{ fontSize: 11, color: colors.muted }}>Cropped to fit</Type>
          {linkError && (
            <Type style={{ fontSize: 11, color: colors.red }}>
              Could not open the link. Try again.
            </Type>
          )}
        </View>
      )}
      {!!person.bio && (
        <Type style={{ maxWidth: 740, lineHeight: 25, marginTop: 10 }}>{person.bio}</Type>
      )}
    </View>
  );
}
