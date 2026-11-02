// Liquid Glass on the web (owner's live-planet direction, Nov 1, 2026): a backdrop blur that also dims and saturates
// what it covers (so text stays AA over bright cloud), a light-catching top edge, and a big soft shadow. Chromium
// also bends the backdrop near the edges like a lens, via an SVG displacement map; other browsers get frosted glass
// only, because a url() they can't use would void the whole backdrop-filter rule.
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, radius as radii } from '@/theme';

const FILTER_ID = 'wl-glass-lens';

/** Chromium exposes userAgentData; it's also the engine that applies SVG filters in backdrop-filter. */
const lensing = typeof document !== 'undefined' && typeof navigator !== 'undefined' && 'userAgentData' in navigator;

// Displacement map: neutral grey in the middle, pushing pixels outward near the edges (R = x, G = y), so the backdrop
// near the rim is sampled from further in, like light through a rounded pane. One map, stretched to every element.
function lensMap(size = 128, edge = 0.22) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const ramp = (u: number) => {
    // u in 0..1 across the element; returns -1..1 toward the nearer edge, eased, zero in the middle band.
    const d = u < 0.5 ? u : 1 - u;
    if (d >= edge) return 0;
    const k = 1 - d / edge;
    return (u < 0.5 ? 1 : -1) * k * k;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i] = 128 + 127 * ramp((x + 0.5) / size);
      img.data[i + 1] = 128 + 127 * ramp((y + 0.5) / size);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

if (lensing && !document.getElementById(FILTER_ID)) {
  const map = lensMap();
  if (map) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    svg.innerHTML = `<filter id="${FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feImage href="${map}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="28" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
    document.body.appendChild(svg);
  }
}

const backdrop = lensing ? `url(#${FILTER_ID}) ${glass.backdrop}` : glass.backdrop;

// A screen can thin its default glass by setting these custom properties on an ancestor (Rankings clears its panels
// while you scroll fast, so the planet shows through; see `useScrollClear`). Unset, they fall back to the full glass.
export const glassVars = { tint: '--wl-glass-tint', backdrop: '--wl-glass-backdrop', webkit: '--wl-glass-backdrop-webkit' } as const;
/** The default glass at clarity 0 (full frost) … 1 (nearly clear), as values for `glassVars`. */
export function clearGlass(c: number) {
  const filter = `blur(${(28 * (1 - c)).toFixed(1)}px) saturate(${Math.round(160 - 50 * c)}%) brightness(${(0.62 + 0.3 * c).toFixed(3)})`;
  return {
    tint: `rgba(16,18,26,${(0.7 - 0.62 * c).toFixed(3)})`,
    backdrop: lensing ? `url(#${FILTER_ID}) ${filter}` : filter,
    webkit: filter,
  };
}

export function Glass({
  children,
  style,
  radius = radii.lg,
  tint = glass.tint,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** Override the tint floor (keep it at least as opaque as the default where text sits on it). */
  tint?: string;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: tint === glass.tint ? `var(${glassVars.tint}, ${tint})` : tint,
          borderRadius: radius,
          // Above the World globe's portrait layer (which is isolated at z 0), so glass frosts the portraits.
          zIndex: 1,
          backdropFilter: `var(${glassVars.backdrop}, ${backdrop})`,
          WebkitBackdropFilter: `var(${glassVars.webkit}, ${glass.backdrop})`,
          boxShadow: `${glass.highlight}, ${glass.shadow}`,
        } as ViewStyle,
        style,
      ]}>
      {children}
    </View>
  );
}
