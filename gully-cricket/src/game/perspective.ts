// World layout of the gully. World units: x = -1..1 wall to wall, h = height,
// z = depth down the street away from the batter. One unit is 3 metres, so the
// gully is 6 m wide and the bowler releases about 19 m away.

export const M = 3;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const RELEASE_Z = 6.4;
export const STUMPS_Z = 0.2;
export const BATTER = { x: -0.17, z: 0.5 };
export const BOWLER_RELEASE = { x: 0.06, z: 6.7 };
export const BOWLER_START_Z = 10.5;
export const FIELDERS = [
  { x: 0.6, z: 2.6 },
  { x: -0.55, z: 4.2 },
  { x: -0.4, z: 10.8 },
  { x: 0.7, z: 8.8 },
];
