import { Platform } from 'react-native';

// Wealthline design tokens (owner spec in CLAUDE.md "Visual direction").
export const color = {
  bg: '#FBFBFD',
  surface: '#FFFFFF',
  text: '#1D1D1F',
  textSecondary: '#6E6E73',
  hairline: '#E5E5EA',
  fill: '#F2F2F7',
  action: '#0071E3',
  gain: '#1E7B45',
  loss: '#B42318',
  projected: '#6E6E73',
} as const;

// Web gets a sans fallback so text never flashes in the browser's default serif while Inter loads.
const face = (name: string) => (Platform.OS === 'web' ? `${name}, -apple-system, system-ui, sans-serif` : name);
export const font = {
  regular: face('Inter_400Regular'),
  medium: face('Inter_500Medium'),
  semibold: face('Inter_600SemiBold'),
  bold: face('Inter_700Bold'),
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;
export const contentWidth = 1120;
export const desktopBreakpoint = 900;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

// Tightly tracked display type; letterSpacing in px, so it scales with size.
export const type = {
  display: { fontFamily: font.bold, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  title: { fontFamily: font.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.7 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  number: { fontFamily: font.semibold, fontVariant: ['tabular-nums' as const] },
} as const;
