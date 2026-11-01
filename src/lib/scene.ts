// Shared state between screens and the planet scene, outside React so scrolling never re-renders anything.
// Screens write; the renderer reads once per frame.

export type CameraPreset = 'orbit';

type SceneState = {
  /** 0 = top of the page (high in space), 1 = bottom (closer, steeper horizon). */
  progress: number;
  /** Scroll speed in screens per second (signed); adds a little spin to the view, even past the camera's descent. */
  velocity: number;
  preset: CameraPreset;
};

export const scene: SceneState = { progress: 0, velocity: 0, preset: 'orbit' };

let last = { y: 0, t: 0 };

/**
 * Report a scroll position, in px. `max` is the scrollable distance (content minus viewport), `viewport` the visible
 * height. The camera completes its descent within the first two screens, so long lists don't stretch it out.
 */
export function reportScroll(y: number, max: number, viewport: number, now = performance.now()) {
  const span = Math.min(max, 2 * viewport);
  const progress = span > 1 ? Math.min(Math.max(y / span, 0), 1) : 0;
  const dt = (now - last.t) / 1000;
  // A lone jump (wheel step, Page Down) arrives long after the last event: count it as a half-second flick.
  if (dt > 0 && viewport > 0) scene.velocity = (y - last.y) / viewport / Math.min(Math.max(dt, 1 / 60), 0.5);
  last = { y, t: now };
  scene.progress = progress;
}
