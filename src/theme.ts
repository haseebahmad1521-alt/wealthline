import { Platform } from 'react-native';

// Wealthline design tokens (owner spec in CLAUDE.md "Visual direction"; live-planet decision, Nov 1, 2026).
// Dark glass over the planet scene. Text colors keep WCAG AA (4.5:1) on `glass` even with a white cloud
// directly behind it (worst case: secondary 5.2, loss 4.8), because glass dims and tints whatever it covers.
export const color = {
  bg: '#04060B', // deep space, behind the scene and wherever the scene isn't drawn
  surface: 'rgba(16,18,26,0.70)', // the glass tint floor; see `glass` below
  text: '#F5F5F7',
  textSecondary: '#B1B1B8',
  hairline: 'rgba(255,255,255,0.14)',
  fill: 'rgba(255,255,255,0.08)',
  action: '#6CB8FF',
  actionTint: 'rgba(108,184,255,0.16)',
  onAction: '#04060B', // text on a filled action button
  gain: '#4ADE80',
  gainTint: 'rgba(74,222,128,0.14)',
  loss: '#FF8A80',
  lossTint: 'rgba(255,138,128,0.14)',
  projected: '#B1B1B8',
} as const;

/** Liquid Glass recipe shared by web CSS and native fallbacks. */
export const glass = {
  tint: color.surface,
  /** Web backdrop: blur, a little saturation, and dimming so text stays readable over bright cloud. */
  backdrop: 'blur(28px) saturate(160%) brightness(0.62)',
  /** Inner light along the top edge and a faint rim, like light caught in the glass. */
  highlight: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.10)',
  /** Big, soft drop shadow. */
  shadow: '0 24px 64px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)',
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
  shadowOpacity: 0.45,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: 20 },
  elevation: 8,
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
