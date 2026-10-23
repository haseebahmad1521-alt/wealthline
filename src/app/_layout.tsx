// Per-weight imports: the package root would bundle all 18 Inter files (~6 MB).
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, Text } from 'react-native';

import { DataProvider } from '@/lib/data';
// Web: capture the browser's install prompt at start-up, before the Account screen exists.
import '@/lib/install';
import { color, font } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  // A font failure falls back to the system face rather than blocking the app.
  if (!loaded && !error) return null;

  return (
    <DataProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: color.bg },
          headerTintColor: color.action,
          headerTitleStyle: { fontFamily: font.semibold, color: color.text },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: color.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="person/[slug]"
          options={{ title: '', headerLeft: (p) =>
            // Native keeps the system back button (and edge swipe); web has none, so it gets ours.
            Platform.OS === 'web' || !p.canGoBack ? <HeaderLink label={p.canGoBack ? 'Back' : 'Rankings'} /> : undefined,
        }}
        />
        <Stack.Screen
          name="account"
          options={{ presentation: 'modal', title: '', headerRight: () => <HeaderLink label="Done" /> }}
        />
        <Stack.Screen name="admin" options={{ title: 'Admin' }} />
      </Stack>
    </DataProvider>
  );
}

/** Back/close for screens opened directly from a link, where there is no history to pop. */
function HeaderLink({ label }: { label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 17, color: color.action }}>{label}</Text>
    </Pressable>
  );
}
