import type { ConfigContext, ExpoConfig } from 'expo/config';

// One knob for the GitHub Pages subpath (e.g. EXPO_BASE_URL=/wealthline/app); empty for local dev.
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL ?? '' },
  }) as ExpoConfig;
