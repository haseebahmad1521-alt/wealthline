import { useState } from 'react';
import { Image, Linking, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
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
          backgroundColor: colors.heroPhoto,
          height: desktop ? 460 : Math.min(440, Math.round(width * 1.12)),
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {portrait && status !== 'error' ? (
          <>
            {status === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
            {desktop && (
              // Wide screens: the portrait sits whole in the middle over a soft blurred copy,
              // instead of being cropped to a strip of face.
              <Image
                key={`backdrop-${person.slug}-${attempt}`}
                source={{ uri: portrait.imageUrl }}
                blurRadius={40}
                accessible={false}
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.55 }}
                resizeMode="cover"
              />
            )}
            <Image
              key={`${person.slug}-${attempt}`}
              source={{ uri: portrait.imageUrl }}
              accessibilityLabel={`Portrait of ${person.name}`}
              style={{ position: 'absolute', width: '100%', height: '100%' }}
              resizeMode={desktop ? 'contain' : 'cover'}
              onLoad={() => setStatus('ready')}
              onError={() => {
                setStatus('error');
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              }}
            />
          </>
        ) : (
          <View style={{ gap: 16, alignItems: 'center', paddingTop: 60 }}>
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
        <IdentityBar person={person} desktop={desktop} narrow={width < 400} />
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

// Slim identity header over the top of the hero photo. The frosted blur is decoration; the
// tinted layer under the text keeps it readable on any photo and where blur is unsupported.
function IdentityBar({
  person,
  desktop,
  narrow,
}: {
  person: Person;
  desktop: boolean;
  narrow: boolean;
}) {
  const details = [
    narrow ? `No. ${person.rank}` : null,
    person.main_source,
    person.age != null ? `Age ${person.age}` : null,
    person.residence,
    person.citizenship,
  ].filter(Boolean);
  return (
    <View
      style={{
        position: 'absolute',
        top: desktop ? 14 : 10,
        left: desktop ? 14 : 10,
        right: desktop ? 14 : 10,
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      <BlurView intensity={30} tint="light" style={{ position: 'absolute', inset: 0 }} />
      <View
        style={{
          backgroundColor: colors.heroBar,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 9,
          paddingLeft: desktop ? 18 : 14,
          paddingRight: 9,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            {!narrow && (
              <Type weight="semibold" style={{ color: colors.heroInk, fontSize: 12 }}>
                No. {person.rank}
              </Type>
            )}
            <Type
              weight="bold"
              accessibilityRole="header"
              numberOfLines={2}
              style={{
                flexShrink: 1,
                fontSize: desktop ? 22 : 18,
                lineHeight: desktop ? 27 : 22,
                letterSpacing: desktop ? -0.6 : -0.4,
              }}
            >
              {person.name}
            </Type>
          </View>
          {details.length > 0 && (
            <Type
              numberOfLines={1}
              style={{ color: colors.heroBarMuted, fontSize: 12, lineHeight: 17 }}
            >
              {details.join(' · ')}
            </Type>
          )}
        </View>
        <FollowButton person={person} compact={narrow} />
      </View>
    </View>
  );
}
