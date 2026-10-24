import { NativeTabs } from 'expo-router/native-tabs';

import { color, font } from '@/theme';

/** Desktop top bar is web-only; native has no equivalent. */
export const TopNav = (): null => null;

// iOS: system tab bar (Liquid Glass); Android: Material navigation bar. SF Symbols / Material icons.
export default function AppTabs() {
  return (
    <NativeTabs
      tintColor={color.action}
      labelStyle={{ fontFamily: font.medium }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Rankings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="leaderboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="projects">
        <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" md="rocket_launch" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="watchlist">
        <NativeTabs.Trigger.Label>Watchlist</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="star.fill" md="star" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
