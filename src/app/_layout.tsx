// Uniwind + HeroUI Native styles (Wealthline theme tokens live in this file).
import '../global.css';
// Per-weight imports: the package root would bundle all 18 Inter files (~6 MB).
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { HeroUINativeProvider } from 'heroui-native';
import { Platform, Pressable, Text, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TopNav } from '@/components/app-tabs';
import { PlanetScene } from '@/components/planet/planet-scene';

import { CurrencyProvider } from '@/lib/currency';
import { lastTab } from '@/lib/last-tab';
import { DataProvider } from '@/lib/data';
import { useWarmup } from '@/lib/warmup';
// Web: capture the browser's install prompt at start-up, before the Account screen exists.
import '@/lib/install';
// Web: lift an activation session out of the URL fragment before anything else reads the address.
import '@/lib/activation';
import { color, desktopBreakpoint, font } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// Navigation paints its own background under screens; keep it clear so the planet shows through.
const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent', card: 'transparent', text: color.text, primary: color.action, border: color.hairline },
};

export default function RootLayout() {
  // Desktop web: Stack screens above the tabs keep the site's top navigation instead of a back header.
  const desktopWeb = Platform.OS === 'web' && useWindowDimensions().width >= desktopBreakpoint;
  const topNav = desktopWeb ? { header: () => <TopNav /> } : null;
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  // A font failure falls back to the system face rather than blocking the app.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <HeroUINativeProvider>
    <DataProvider>
      <CurrencyProvider>
      <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Warmup />
      {/* One planet behind every screen; screens and headers are transparent glass over it. */}
      <PlanetScene />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: 'transparent' },
          headerTintColor: color.action,
          headerTitleStyle: { fontFamily: font.semibold, color: color.text },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="person/[slug]"
          options={{ title: '', headerLeft: (p) =>
            // Native keeps the system back button (and edge swipe); web has none, so it gets ours.
            Platform.OS === 'web' || !p.canGoBack ? <HeaderLink label={p.canGoBack || lastTab() !== '/' ? 'Back' : 'Rankings'} /> : undefined,
          ...topNav,
        }}
        />
        <Stack.Screen
          name="account"
          options={{ presentation: 'modal', title: '', headerRight: () => <HeaderLink label="Done" />, ...topNav }}
        />
        <Stack.Screen name="admin" options={{ title: 'Admin', ...topNav }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found', ...topNav }} />
        <Stack.Screen
          name="compare"
          options={{ presentation: 'modal', title: '', headerRight: () => <HeaderLink label="Done" />, ...topNav }}
        />
      </Stack>
      </ThemeProvider>
      </CurrencyProvider>
    </DataProvider>
    </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

/** Back/close for screens opened directly from a link, where there is no history to pop. */
function Warmup() {
  useWarmup();
  return null;
}

function HeaderLink({ label }: { label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(lastTab() as '/'))}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginHorizontal: 8 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 17, color: color.action }}>{label}</Text>
    </Pressable>
  );
}
