import type { BallOutcome, Delivery } from './engine';
import { BOWLER_RELEASE, RELEASE_Z, STUMPS_Z, lerp } from './perspective';

export interface WorldPos {
  x: number;
  h: number;
  z: number;
}

/** Ball position while it travels from the bowler's hand to the stumps. */
export function deliveryPosition(d: Delivery, p: number): WorldPos {
  const z = lerp(RELEASE_Z, STUMPS_Z, p);
  const x = lerp(BOWLER_RELEASE.x - 0.08, d.line, p);
  let h: number;
  if (p < d.bounceAt) {
    h = 0.5 * (1 - (p / d.bounceAt) ** 2);
  } else {
    const span = 1 - d.bounceAt + 0.25;
    const u = (p - d.bounceAt) / span;
    h = d.bounceRise * (1 - (1 - u) ** 2);
  }
  return { x, h: Math.max(0, h), z };
}

interface HitPlan {
  dest: WorldPos;
  peak: number;
  duration: number;
}

/** Where the ball goes after the batter connects. */
export function hitPlan(o: BallOutcome, from: WorldPos): HitPlan {
  const dir = o.direction;
  const sgn = dir < 0 ? -1 : 1;
  switch (o.path) {
    case 'six':
      return { dest: { x: dir * 0.9, h: 4.6, z: 17 }, peak: 1.6, duration: 1.35 };
    case 'four':
      return { dest: { x: dir * 0.7, h: 0, z: 14 }, peak: 0.25, duration: 1.15 };
    case 'wall':
      return { dest: { x: sgn * 0.92, h: 0.25, z: 2.6 + Math.abs(dir) * 2.4 }, peak: 0.35, duration: 0.85 };
    case 'skier':
      return sgn > 0
        ? { dest: { x: 0.6, h: 0.45, z: 2.6 }, peak: 3.2, duration: 1.4 }
        : { dest: { x: -0.55, h: 0.45, z: 4.2 }, peak: 3.2, duration: 1.4 };
    case 'house':
      return { dest: { x: sgn * 1.02, h: 1.45, z: 3.8 }, peak: 0.9, duration: 0.95 };
    case 'edge':
      return { dest: { x: sgn * 0.88, h: 0.55, z: 0.9 }, peak: 0.25, duration: 0.6 };
    case 'dribble':
      return { dest: { x: dir * 0.35, h: 0, z: 1.7 }, peak: 0.05, duration: 0.75 };
    default:
      return { dest: from, peak: 0, duration: 0.5 };
  }
}

export function hitPosition(from: WorldPos, plan: HitPlan, t: number, path: BallOutcome['path']): WorldPos {
  const e = path === 'four' || path === 'dribble' ? 1 - (1 - t) ** 2 : t;
  const arc = plan.peak * 4 * t * (1 - t);
  const bounce = path === 'four' ? Math.abs(Math.sin(t * Math.PI * 3)) * 0.12 * (1 - t) : 0;
  return {
    x: lerp(from.x, plan.dest.x, e),
    z: lerp(from.z, plan.dest.z, e),
    h: Math.max(0, lerp(from.h, plan.dest.h, t) + arc + bounce),
  };
}
