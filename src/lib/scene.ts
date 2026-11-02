import { useSyncExternalStore } from 'react';

// Shared state between screens and the planet scene, outside React so scrolling and zooming never re-render anything.
// Screens write; the renderer reads once per frame and publishes `project` back for overlays.

/** 'orbit': the scroll-driven view behind most screens. 'world': looking straight at the globe (World tab). */
export type CameraPreset = 'orbit' | 'world';

/**
 * Where the orbit camera hangs for each page (owner, Nov 2, 2026: one viewframe, every page a different angle).
 * lat: the camera's latitude; east: degrees east of the subsolar point (0 noon, ~90 dusk, 180 midnight); roll: extra
 * horizon tilt in degrees. Presentation only: the sunlight itself stays real wherever the camera hangs.
 */
export const ANGLES = {
  // South of the populated mid-latitudes, east of the sun: the evening terminator and its city lights cross the view.
  home: { lat: -26, east: 78, roll: 0 },
  // High over the day side near the morning edge: bright oceans, the sun low beside the horizon.
  projects: { lat: 34, east: -62, roll: 7 },
  // Deep on the night side: a quiet, darker view of city lights for the private list.
  watchlist: { lat: -8, east: 128, roll: -5 },
} as const;
export type CameraAngle = keyof typeof ANGLES;

export type Projected = { x: number; y: number; /** 1 facing the camera … 0 at the limb, negative behind. */ facing: number };

type SceneState = {
  /** 0 = top of the page (high in space), 1 = bottom (closer, steeper horizon). */
  progress: number;
  /** Scroll speed in screens per second (signed); adds a little spin to the view, even past the camera's descent. */
  velocity: number;
  preset: CameraPreset;
  /** The orbit camera's angle for the page in view. */
  angle: CameraAngle;
  /** How far the camera has swung into the World view (0 orbit … 1 world, eased); set by the planet scene each frame. */
  worldMix: number;
  /** A place the camera flies down to and holds while a screen is open (a profile: the person's headquarters). */
  visit: { lat: number; lng: number } | null;
  world: {
    /** The point turned toward the camera. */
    lat: number;
    lng: number;
    /** 0 = whole globe in view … 1 = zoomed in close. */
    zoom: number;
    /** Where the globe's centre sits on screen (fractions of the viewport) and its radius at zoom 0 (px). */
    centerX: number;
    centerY: number;
    radiusPx: number;
  };
  /** Countries shaded on the planet (World's Economies and What if views); bump `fillsVersion` after changing them. */
  fills: { iso2: string; strength: number; risk?: boolean }[];
  fillsVersion: number;
  /** Screen position (px, viewport coordinates) of a point on Earth's surface; set by the planet scene each frame. */
  project: ((lat: number, lng: number) => Projected) | null;
  /** Ask for a frame now (the loop pauses under reduced motion); set by the planet scene. */
  invalidate: (() => void) | null;
};

export const scene: SceneState = {
  progress: 0,
  velocity: 0,
  preset: 'orbit',
  angle: 'home',
  worldMix: 0,
  visit: null,
  // Opens over the North Atlantic: the Americas, Europe and Africa (where most tracked headquarters are) in view.
  world: { lat: 32, lng: -45, zoom: 0, centerX: 0.5, centerY: 0.5, radiusPx: 160 },
  fills: [],
  fillsVersion: 0,
  project: null,
  invalidate: null,
};

/** Zoom 0…1 as a screen-size factor for the globe (1× … 5×). */
export const clampZoom = (z: number) => Math.min(Math.max(z, 0), 1);
export const zoomFactor = (z: number) => 2 ** (clampZoom(z) * 2.32);

let last = { y: 0, t: 0 };

// The ticker and tab bar slide away while you scroll down a page and come back when you scroll up (or reach the top).
let chromeHidden = false;
const chromeListeners = new Set<() => void>();
function setChromeHidden(hidden: boolean) {
  if (hidden === chromeHidden) return;
  chromeHidden = hidden;
  chromeListeners.forEach((l) => l());
}
const subscribeChrome = (l: () => void) => (chromeListeners.add(l), () => void chromeListeners.delete(l));
/** True while the ticker and tab bar should be tucked away. */
export const useChromeHidden = () => useSyncExternalStore(subscribeChrome, () => chromeHidden, () => false);

/**
 * Report a scroll position, in px. `max` is the scrollable distance (content minus viewport), `viewport` the visible
 * height. The descent spans the whole page (owner, Nov 1, 2026): Earth keeps rising through the list and fills most
 * of the view at the bottom.
 */
export function reportScroll(y: number, max: number, viewport: number, now = performance.now(), jump = false) {
  const progress = max > 1 ? Math.min(Math.max(y / max, 0), 1) : 0;
  if (jump) {
    // Another screen came into view at its own scroll position: no spin, and the bars come back.
    last = { y, t: now };
    scene.progress = progress;
    setChromeHidden(false);
    return;
  }
  const dy = y - last.y;
  if (y < 48) setChromeHidden(false);
  else if (dy > 6) setChromeHidden(true);
  else if (dy < -6) setChromeHidden(false);
  const dt = (now - last.t) / 1000;
  // A lone jump (wheel step, Page Down) arrives long after the last event: count it as a half-second flick.
  if (dt > 0 && viewport > 0) scene.velocity = (y - last.y) / viewport / Math.min(Math.max(dt, 1 / 60), 0.5);
  last = { y, t: now };
  scene.progress = progress;
}
