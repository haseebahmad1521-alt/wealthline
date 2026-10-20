import { ChartNoAxesColumnIncreasing, Users, Layers, Bookmark } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/lib/wealthline-theme';
export default function TabLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <>
      {/* eslint-disable-next-line react/style-prop-object -- Expo StatusBar style is a string enum, not a view style. */}
      <StatusBar style="dark" />
      <Tabs
        screenListeners={({ navigation }) => ({
          tabPress: () => {
            if (!navigation.isFocused()) void Haptics.selectionAsync();
          },
        })}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarStyle:
            width >= 800
              ? { display: 'none' }
              : {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                  height: 76 + insets.bottom,
                  paddingTop: 10,
                  paddingBottom: 12 + insets.bottom,
                  shadowOpacity: 0,
                  elevation: 0,
                },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Rankings',
            tabBarIcon: ({ color }) => <ChartNoAxesColumnIncreasing color={color} size={21} />,
          }}
        />
        <Tabs.Screen
          name="people"
          options={{
            title: 'People',
            tabBarIcon: ({ color }) => <Users color={color} size={21} />,
          }}
        />
        <Tabs.Screen
          name="projects"
          options={{
            title: 'Projects',
            tabBarIcon: ({ color }) => <Layers color={color} size={21} />,
          }}
        />
        <Tabs.Screen
          name="watchlist"
          options={{
            title: 'Watchlist',
            tabBarIcon: ({ color }) => <Bookmark color={color} size={21} />,
          }}
        />
      </Tabs>
    </>
  );
}
