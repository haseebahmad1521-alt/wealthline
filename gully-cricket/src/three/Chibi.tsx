import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

import type { Outfit } from '../data/players';
import { Builder, compose } from './builder';

// Stylised street cricketers: big expressive heads, real clothes (collars,
// pockets, rolled sleeves, untucked shirts, track pants, chappals) and
// jointed limbs. Each body part is merged into one vertex-coloured mesh, so a
// person costs about a dozen draw calls. Faces +Z in local space.

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  bat: THREE.Group | null;
}

// Proportions (teen, metres).
const HIP_Y = 0.8;
const THIGH = 0.4;
const SHIN = 0.37;
const UPPER = 0.27;
const FORE = 0.25;
const SHOULDER = { x: 0.2, y: 0.38 };
const NECK_Y = 0.48;

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide });

type V3 = [number, number, number];

const G = {
  cone: new THREE.ConeGeometry(1, 1, 10),
  arc: new THREE.TorusGeometry(1, 0.2, 6, 16, Math.PI),
  ring: new THREE.TorusGeometry(1, 0.12, 6, 20),
  disc: new THREE.CylinderGeometry(1, 1, 1, 18),
  dome: new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
};

function mix(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

function lathe(b: Builder, color: string, profile: [number, number][], pos: V3, scale: V3 = [1, 1, 1]) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 22);
  b.add(geo, color, compose(pos, [0, 0, 0], scale));
  geo.dispose();
}

// ---------------- Part builders ----------------

function buildTorso(o: Outfit): THREE.BufferGeometry {
  const b = new Builder();
  const belly = o.build === 'uncle' ? 1.22 : 1;
  const hem =
    o.kind === 'shalwar' ? -0.5 : o.kind === 'kurta' ? -0.42 : o.tucked ? 0.0 : o.kind === 'vest' ? -0.05 : -0.1;
  const flare = o.kind === 'shalwar' || o.kind === 'kurta' ? 0.25 : 0.18;
  lathe(
    b,
    o.top,
    [
      [flare, hem],
      [0.175 * belly, Math.max(hem + 0.05, 0.02)],
      [0.185 * belly, 0.14],
      [0.195 * Math.sqrt(belly), 0.28],
      [0.2, SHOULDER.y],
      [0.15, 0.45],
      [0.07, 0.49],
    ],
    [0, 0, 0],
    [1, 1, 0.72],
  );
  // Neck.
  b.cylinder(o.skin, 0.055, 0.12, [0, 0.52, 0]);
  const front = 0.147;
  if (o.kind === 'pantshirt' || o.kind === 'jersey') {
    // Collar flaps and placket.
    b.box(o.kind === 'jersey' ? o.accent : mix(o.top, '#FFFFFF', 0.25), [0.08, 0.035, 0.012], [-0.04, 0.47, 0.1], [0.3, 0, 0.55]);
    b.box(o.kind === 'jersey' ? o.accent : mix(o.top, '#FFFFFF', 0.25), [0.08, 0.035, 0.012], [0.04, 0.47, 0.1], [0.3, 0, -0.55]);
  }
  if (o.kind === 'pantshirt') {
    b.box(mix(o.top, '#000000', 0.08), [0.024, 0.42, 0.006], [0, 0.22, front]);
    for (const y of [0.36, 0.26, 0.16, 0.06]) b.sphere('#EDEDED', 0.008, [0, y, front + 0.005]);
    b.box(mix(o.top, '#000000', 0.12), [0.07, 0.075, 0.006], [-0.085, 0.3, front - 0.008]);
  }
  if (o.kind === 'jersey') {
    for (const s of [-1, 1]) b.box(o.accent, [0.012, 0.36, 0.05], [s * 0.192, 0.17, 0], [0, 0, s * 0.05]);
    b.box('#F4F4F0', [0.12, 0.14, 0.006], [0, 0.27, -front]);
    b.box(o.accent, [0.02, 0.1, 0.006], [0, 0.27, -front - 0.004]);
  }
  if (o.kind === 'tshirt' && o.top !== '#F1FAEE') {
    // A print on the tee.
    b.box(mix(o.top, '#FFFFFF', 0.55), [0.11, 0.08, 0.006], [0, 0.27, front]);
  }
  if (o.kind === 'shalwar' || o.kind === 'kurta') {
    b.add(G.ring, mix(o.top, '#000000', 0.08), compose([0, 0.47, 0], [Math.PI / 2, 0, 0], [0.075, 0.075, 0.075]));
    b.box(mix(o.top, '#000000', 0.08), [0.02, 0.18, 0.006], [0, 0.37, front]);
    for (const y of [0.42, 0.36, 0.3]) b.sphere('#D9D2C3', 0.008, [0, y, front + 0.005]);
  }
  if (o.kind === 'vest') {
    // Baniyan: skin shows at the shoulders and chest top.
    b.sphere(o.skin, 0.1, [0, 0.42, 0.04], [1.2, 0.5, 0.9]);
  }
  if (o.tucked) {
    lathe(b, '#3B2B20', [[0.178, -0.01], [0.178, 0.025]], [0, 0, 0], [1, 1, 0.72]);
    b.box('#C9A227', [0.03, 0.025, 0.006], [0, 0.007, 0.13]);
  }
  return b.build();
}

function buildHead(o: Outfit, batter: boolean): THREE.BufferGeometry {
  const b = new Builder();
  const c: V3 = [0, 0.17, 0];
  const at = (x: number, y: number, z: number): V3 => [c[0] + x, c[1] + y, c[2] + z];
  const skinDark = mix(o.skin, '#5A2A1A', 0.18);
  const blush = mix(o.skin, '#E06A6A', 0.3);

  b.sphere(o.skin, 1, at(0, 0, 0), [0.2, 0.215, 0.2]);
  b.sphere(o.skin, 1, at(0, -0.08, 0.04), [0.165, 0.125, 0.155]);
  for (const s of [-1, 1]) {
    b.sphere(o.skin, 1, at(s * 0.198, -0.01, -0.005), [0.035, 0.058, 0.045]);
    b.sphere(skinDark, 1, at(s * 0.205, -0.01, 0.006), [0.015, 0.032, 0.02]);
    b.sphere(blush, 1, at(s * 0.12, -0.07, 0.15), [0.04, 0.026, 0.02]);
    // Eyes.
    const ex = s * 0.074;
    b.sphere('#F8F6F0', 1, at(ex, 0.01, 0.168), [0.05, 0.06, 0.03]);
    b.sphere('#5A3215', 1, at(ex, 0.003, 0.19), [0.032, 0.037, 0.018]);
    b.sphere('#111111', 1, at(ex, 0.003, 0.2), [0.017, 0.02, 0.01]);
    b.sphere('#FFFFFF', 0.008, at(ex + 0.012, 0.018, 0.208));
    b.add(G.dome, skinDark, compose(at(ex, 0.028, 0.17), [0.25, 0, 0], [0.053, 0.032, 0.034]));
    b.box(o.hair, [0.075, 0.02, 0.022], at(ex, 0.088, 0.178), [0, 0, s * -0.14]);
  }
  // Nose and mouth.
  b.sphere(skinDark, 1, at(0, -0.035, 0.2), [0.03, 0.034, 0.034]);
  const grin = batter || o.build === 'kid';
  b.add(G.arc, '#5A1A1A', compose(at(0, -0.085, 0.184), [0, 0, Math.PI], [0.045, 0.04, 0.03]));
  if (grin) {
    b.sphere('#5A1A1A', 1, at(0, -0.1, 0.178), [0.04, 0.02, 0.012]);
    b.box('#FFFFFF', [0.06, 0.012, 0.006], at(0, -0.093, 0.188));
  }
  if (o.moustache) {
    for (const s of [-1, 1]) b.sphere(o.hair, 1, at(s * 0.03, -0.062, 0.196), [0.036, 0.013, 0.016]);
  }
  if (o.beard) {
    b.sphere(o.hair, 1, at(0, -0.12, 0.05), [0.16, 0.1, 0.14]);
    b.sphere(o.skin, 1, at(0, -0.092, 0.17), [0.05, 0.03, 0.02]);
  }

  // Hair.
  const hair = o.hairStyle === 'buzz' ? mix(o.hair, o.skin, 0.25) : o.hair;
  b.sphere(hair, 1, at(0, 0.0, -0.05), [0.198, 0.2, 0.17]);
  b.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, compose(at(0, 0.03, -0.012), [-0.38, 0, 0], [0.21, 0.205, 0.214]));
  const tufts: [V3, V3, number][] = [];
  switch (o.hairStyle) {
    case 'messy':
      tufts.push(
        [at(-0.08, 0.15, 0.14), [1.1, 0, 0.3], 0.06],
        [at(0.0, 0.17, 0.15), [1.2, 0, 0], 0.065],
        [at(0.09, 0.15, 0.13), [1.1, 0, -0.35], 0.06],
        [at(-0.15, 0.12, 0.02), [0.3, 0, 0.9], 0.055],
        [at(0.15, 0.12, 0.02), [0.3, 0, -0.9], 0.055],
        [at(0.0, 0.2, -0.05), [-0.4, 0, 0.2], 0.06],
        [at(-0.06, 0.16, -0.14), [-1.0, 0, 0.3], 0.06],
      );
      break;
    case 'spiky':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        tufts.push([at(Math.cos(a) * 0.1, 0.18, Math.sin(a) * 0.1 - 0.02), [Math.sin(a) * 0.5 - 0.2, 0, -Math.cos(a) * 0.5], 0.045]);
      }
      break;
    case 'side':
      b.sphere(hair, 1, at(0.04, 0.16, 0.05), [0.16, 0.07, 0.15]);
      tufts.push([at(0.1, 0.13, 0.15), [1.4, 0, -0.6], 0.06]);
      break;
    case 'curly':
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const ring = i % 2 ? 0.17 : 0.11;
        b.sphere(hair, 0.05, at(Math.cos(a) * ring, 0.15 + (i % 3) * 0.02, Math.sin(a) * ring * 0.9 - 0.02));
      }
      break;
    case 'buzz':
      break;
  }
  for (const [p, r, s] of tufts) b.add(G.cone, hair, compose(p, r, [s * 0.75, s * 2.2, s * 0.75]));

  // Headwear.
  switch (o.headwear) {
    case 'cap':
    case 'capBack': {
      const col = o.kind === 'jersey' ? o.top : '#C1272D';
      b.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), col, compose(at(0, 0.06, -0.01), [-0.15, 0, 0], [0.215, 0.18, 0.22]));
      b.sphere(mix(col, '#FFFFFF', 0.85), 0.012, at(0, 0.24, -0.01));
      const back = o.headwear === 'capBack' ? -1 : 1;
      b.add(G.disc, mix(col, '#000000', 0.18), compose(at(0, 0.075, back * 0.2), [back * 0.12, 0, 0], [0.14, 0.014, 0.12]));
      break;
    }
    case 'topi':
      b.cylinder('#F7F4EC', 0.18, 0.08, at(0, 0.18, -0.02), [-0.2, 0, 0]);
      break;
    case 'headband':
      break;
  }
  if (o.headwear === 'headband' || (batter && o.headwear === 'none')) {
    b.add(G.ring, '#D62828', compose(at(0, 0.07, 0.0), [Math.PI / 2 - 0.3, 0, 0], [0.208, 0.208, 0.25]));
  }
  return b.build();
}

function buildUpperArm(o: Outfit, batter: boolean): THREE.BufferGeometry {
  const b = new Builder();
  const sleeve = o.sleeves === 'none' ? o.skin : o.top;
  b.sphere(sleeve, 0.072, [0, -0.01, 0]);
  if (o.sleeves === 'short') {
    b.cylinder(o.top, 0.07, 0.14, [0, -0.07, 0], [0, 0, 0], 1.0);
    if (o.kind === 'jersey') b.cylinder(o.accent, 0.072, 0.02, [0, -0.135, 0]);
    b.cylinder(o.skin, 0.047, UPPER - 0.1, [0, -0.1 - (UPPER - 0.1) / 2, 0]);
  } else if (o.sleeves === 'none') {
    b.cylinder(o.skin, 0.05, UPPER, [0, -UPPER / 2, 0]);
  } else {
    b.cylinder(sleeve, 0.06, UPPER, [0, -UPPER / 2, 0], [0, 0, 0], 1.08);
  }
  b.sphere(o.sleeves === 'full' || o.sleeves === 'rolled' ? o.top : o.skin, 0.052, [0, -UPPER, 0]);
  void batter;
  return b.build();
}

function buildForearm(o: Outfit, batter: boolean): THREE.BufferGeometry {
  const b = new Builder();
  if (o.sleeves === 'full') {
    b.cylinder(o.top, 0.05, FORE - 0.06, [0, -(FORE - 0.06) / 2, 0], [0, 0, 0], 1.1);
    b.cylinder(mix(o.top, '#000000', 0.08), 0.052, 0.035, [0, -(FORE - 0.06), 0]);
  } else {
    if (o.sleeves === 'rolled') b.cylinder(mix(o.top, '#FFFFFF', 0.15), 0.06, 0.06, [0, -0.02, 0]);
    b.cylinder(o.skin, 0.042, FORE - 0.06, [0, -(FORE - 0.06) / 2, 0], [0, 0, 0], 1.18);
  }
  const hy = -FORE + 0.02;
  if (batter) {
    // Batting glove: padded fingers.
    b.sphere('#F2EEE4', 1, [0, hy, 0.005], [0.058, 0.07, 0.045]);
    for (let i = 0; i < 4; i++) b.box('#E2DCCF', [0.022, 0.06, 0.05], [-0.033 + i * 0.022, hy - 0.04, 0.01]);
    b.cylinder('#1D5FA8', 0.06, 0.03, [0, hy + 0.055, 0]);
  } else {
    b.sphere(o.skin, 1, [0, hy, 0], [0.042, 0.055, 0.028]);
    b.sphere(o.skin, 1, [0, hy - 0.045, 0.006], [0.036, 0.03, 0.022]);
    b.sphere(o.skin, 1, [0.03, hy + 0.005, 0.02], [0.014, 0.03, 0.014]);
  }
  return b.build();
}

function legColor(o: Outfit) {
  return o.kind === 'shalwar' ? o.top : o.bottom;
}

function buildThigh(o: Outfit, batter: boolean): THREE.BufferGeometry {
  const b = new Builder();
  const col = legColor(o);
  if (o.bottomKind === 'shorts') {
    b.cylinder(col, 0.095, 0.27, [0, -0.12, 0], [0, 0, 0], 1.05);
    b.cylinder(o.skin, 0.062, THIGH - 0.24, [0, -0.24 - (THIGH - 0.24) / 2, 0]);
  } else if (o.bottomKind === 'shalwar' || o.bottomKind === 'pajama') {
    b.cylinder(col, 0.1, THIGH + 0.02, [0, -THIGH / 2, 0], [0, 0, 0], 1.12);
  } else {
    b.cylinder(col, 0.074, THIGH + 0.02, [0, -THIGH / 2, 0], [0, 0, 0], 1.18);
    if (o.bottomKind === 'track') b.box('#F4F4F0', [0.012, THIGH, 0.02], [0.08, -THIGH / 2, 0]);
    if (o.bottomKind === 'jeans') b.box(mix(col, '#FFFFFF', 0.2), [0.05, 0.006, 0.08], [0, -0.06, 0.04]);
  }
  b.sphere(o.bottomKind === 'shorts' ? o.skin : col, 0.066, [0, -THIGH, 0]);
  if (batter) {
    b.box('#F2EEE4', [0.16, 0.13, 0.08], [0, -THIGH + 0.03, 0.07]);
    b.cylinder('#E7E1D3', 0.05, 0.16, [0, -THIGH - 0.02, 0.1], [0, 0, Math.PI / 2]);
  }
  return b.build();
}

function buildShin(o: Outfit, batter: boolean): THREE.BufferGeometry {
  const b = new Builder();
  const col = legColor(o);
  const bare = o.bottomKind === 'shorts';
  if (bare) {
    b.cylinder(o.skin, 0.05, SHIN, [0, -SHIN / 2, 0], [0, 0, 0], 1.2);
  } else if (o.bottomKind === 'shalwar' || o.bottomKind === 'pajama') {
    b.cylinder(col, 0.06, SHIN - 0.02, [0, -SHIN / 2, 0], [0, 0, 0], 1.6);
    b.cylinder(mix(col, '#000000', 0.08), 0.052, 0.03, [0, -SHIN + 0.035, 0]);
  } else {
    b.cylinder(col, 0.06, SHIN - 0.02, [0, -SHIN / 2, 0], [0, 0, 0], 1.1);
    if (o.bottomKind === 'track') b.box('#F4F4F0', [0.012, SHIN - 0.05, 0.02], [0.065, -SHIN / 2, 0]);
    if (o.bottomKind === 'jeans') b.cylinder(mix(col, '#FFFFFF', 0.15), 0.064, 0.04, [0, -SHIN + 0.04, 0]);
  }
  if (batter) {
    // Leg pad with vertical ridges and straps.
    b.box('#F2EEE4', [0.16, SHIN - 0.04, 0.07], [0, -SHIN / 2 + 0.01, 0.075]);
    for (const x of [-0.05, 0, 0.05]) b.box('#E4DDCD', [0.03, SHIN - 0.06, 0.03], [x, -SHIN / 2 + 0.01, 0.112]);
    for (const y of [-0.08, -0.25]) b.box('#8C6E4B', [0.18, 0.025, 0.1], [0, y, 0.05]);
  }
  // Foot.
  const fy = -SHIN - 0.02;
  if (o.footwear === 'sneaker') {
    b.sphere(o.shoe, 1, [0, fy + 0.005, 0.05], [0.055, 0.042, 0.1]);
    b.box(o.shoe, [0.1, 0.06, 0.09], [0, fy + 0.01, -0.02]);
    b.box('#F2F2F2', [0.11, 0.025, 0.22], [0, fy - 0.03, 0.03]);
    b.box('#FFFFFF', [0.04, 0.01, 0.06], [0, fy + 0.045, 0.06]);
  } else {
    b.sphere(o.skin, 1, [0, fy, 0.04], [0.045, 0.035, 0.095]);
    b.cylinder(o.skin, 0.042, 0.06, [0, fy + 0.03, -0.01]);
    if (o.footwear === 'chappal') {
      b.box(o.shoe, [0.1, 0.018, 0.23], [0, fy - 0.035, 0.03]);
      b.box(o.shoe, [0.1, 0.02, 0.03], [0, fy + 0.0, 0.07]);
      b.box(o.shoe, [0.02, 0.02, 0.06], [0, fy + 0.0, 0.1]);
    }
  }
  return b.build();
}

function buildBat(): THREE.BufferGeometry {
  const b = new Builder();
  b.cylinder('#2B2B2B', 0.02, 0.26, [0, -0.12, 0]);
  for (let i = 0; i < 6; i++) b.cylinder(i % 2 ? '#D62828' : '#F4F4F0', 0.022, 0.03, [0, -0.02 - i * 0.04, 0]);
  b.box('#E2C08D', [0.11, 0.6, 0.035], [0, -0.55, 0]);
  b.box('#CFA86E', [0.12, 0.6, 0.012], [0, -0.55, -0.02]);
  b.box('#D62828', [0.095, 0.11, 0.004], [0, -0.38, 0.019]);
  b.box('#1D5FA8', [0.095, 0.03, 0.004], [0, -0.45, 0.019]);
  b.box('#B88C55', [0.11, 0.03, 0.036], [0, -0.85, 0]);
  return b.build();
}

// ---------------- Component ----------------

interface Props {
  outfit: Outfit;
  rig: MutableRefObject<Rig | null>;
  batter?: boolean;
  position?: V3;
  rotationY?: number;
  scale?: number;
  /** Kept for API compatibility; batters always get a headband unless capped. */
  headband?: boolean;
}

const BUILD_SCALE = { kid: 0.78, teen: 0.95, uncle: 1.02 } as const;
const HEAD_SCALE = { kid: 1.18, teen: 1.05, uncle: 1.0 } as const;

export function Chibi({ outfit, rig, batter = false, position = [0, 0, 0], rotationY = 0, scale = 1 }: Props) {
  const parts = useMemo(
    () => ({
      torso: buildTorso(outfit),
      head: buildHead(outfit, batter),
      upper: buildUpperArm(outfit, batter),
      fore: buildForearm(outfit, batter),
      thigh: buildThigh(outfit, batter),
      shin: buildShin(outfit, batter),
      bat: batter ? buildBat() : null,
    }),
    [outfit, batter],
  );
  useEffect(
    () => () => {
      Object.values(parts).forEach((g) => g?.dispose());
    },
    [parts],
  );

  const refs = {
    root: useRef<THREE.Group>(null),
    hips: useRef<THREE.Group>(null),
    body: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    armL: useRef<THREE.Group>(null),
    armR: useRef<THREE.Group>(null),
    foreL: useRef<THREE.Group>(null),
    foreR: useRef<THREE.Group>(null),
    legL: useRef<THREE.Group>(null),
    legR: useRef<THREE.Group>(null),
    shinL: useRef<THREE.Group>(null),
    shinR: useRef<THREE.Group>(null),
    bat: useRef<THREE.Group>(null),
  };

  useEffect(() => {
    const root = refs.root.current;
    if (!root) return;
    root.traverse((o) => {
      o.castShadow = true;
    });
    rig.current = {
      root,
      hips: refs.hips.current!,
      body: refs.body.current!,
      head: refs.head.current!,
      armL: refs.armL.current!,
      armR: refs.armR.current!,
      foreL: refs.foreL.current!,
      foreR: refs.foreR.current!,
      legL: refs.legL.current!,
      legR: refs.legR.current!,
      shinL: refs.shinL.current!,
      shinR: refs.shinR.current!,
      bat: refs.bat.current,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, parts]);

  const s = BUILD_SCALE[outfit.build] * scale;
  const hs = HEAD_SCALE[outfit.build];
  const arm = (side: -1 | 1, ref: typeof refs.armL, fore: typeof refs.foreL) => (
    <group ref={ref} position={[side * SHOULDER.x * (outfit.build === 'uncle' ? 1.1 : 1), SHOULDER.y, 0]} rotation={[0, 0, side * 0.12]}>
      <mesh geometry={parts.upper} material={MAT} />
      <group ref={fore} position={[0, -UPPER, 0]}>
        <mesh geometry={parts.fore} material={MAT} />
      </group>
    </group>
  );
  const leg = (side: -1 | 1, ref: typeof refs.legL, shin: typeof refs.shinL) => (
    <group ref={ref} position={[side * 0.095, 0, 0]}>
      <mesh geometry={parts.thigh} material={MAT} />
      <group ref={shin} position={[0, -THIGH, 0]}>
        <mesh geometry={parts.shin} material={MAT} />
      </group>
    </group>
  );

  return (
    <group ref={refs.root} position={position} rotation={[0, rotationY, 0]} scale={s}>
      <group ref={refs.hips} position={[0, HIP_Y, 0]}>
        {leg(-1, refs.legL, refs.shinL)}
        {leg(1, refs.legR, refs.shinR)}
        <group ref={refs.body}>
          <mesh geometry={parts.torso} material={MAT} />
          <group ref={refs.head} position={[0, NECK_Y, 0]} scale={hs}>
            <mesh geometry={parts.head} material={MAT} />
          </group>
          {arm(-1, refs.armL, refs.foreL)}
          {arm(1, refs.armR, refs.foreR)}
        </group>
      </group>
      {batter && (
        <group ref={refs.bat}>
          <mesh geometry={parts.bat!} material={MAT} />
        </group>
      )}
    </group>
  );
}

// ---------------- Poses ----------------

const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();

function resetLimbs(r: Rig) {
  r.root.rotation.z = 0;
  r.hips.position.y = HIP_Y;
  r.hips.rotation.set(0, 0, 0);
  for (const g of [r.armL, r.armR, r.foreL, r.foreR, r.legL, r.legR, r.shinL, r.shinR]) g.quaternion.identity();
}

export function standPose(r: Rig, t: number, sway = 1) {
  resetLimbs(r);
  r.root.position.y = 0;
  r.body.rotation.set(0, Math.sin(t * 1.3) * 0.05 * sway, 0);
  r.head.rotation.set(Math.sin(t * 0.9) * 0.05, Math.sin(t * 0.7) * 0.2 * sway, 0);
  r.armL.rotation.set(0.05, 0, -0.12);
  r.armR.rotation.set(0.05, 0, 0.12);
  r.foreL.rotation.set(-0.25, 0, 0);
  r.foreR.rotation.set(-0.25, 0, 0);
  r.legL.rotation.set(0, 0, 0.05);
  r.legR.rotation.set(0, 0, -0.05);
  r.shinL.rotation.set(0.05, 0, 0);
  r.shinR.rotation.set(0.05, 0, 0);
}

/** Hands on hips, chatting: the classic waiting-fielder pose. */
export function akimboPose(r: Rig, t: number) {
  standPose(r, t, 0.6);
  r.armL.rotation.set(0.1, 0, -0.75);
  r.armR.rotation.set(0.1, 0, 0.75);
  r.foreL.rotation.set(-0.3, 0, 1.9);
  r.foreR.rotation.set(-0.3, 0, -1.9);
}

export function readyPose(r: Rig, t: number) {
  resetLimbs(r);
  r.root.position.y = Math.sin(t * 2) * 0.008;
  r.hips.position.y = HIP_Y - 0.14;
  r.body.rotation.set(0.5, 0, 0);
  r.head.rotation.set(-0.45, 0, 0);
  r.armL.rotation.set(-0.75, 0, -0.15);
  r.armR.rotation.set(-0.75, 0, 0.15);
  r.foreL.rotation.set(-0.2, 0, 0);
  r.foreR.rotation.set(-0.2, 0, 0);
  r.legL.rotation.set(-0.55, 0, 0.18);
  r.legR.rotation.set(-0.55, 0, -0.18);
  r.shinL.rotation.set(0.9, 0, 0);
  r.shinR.rotation.set(0.9, 0, 0);
}

export function sitPose(r: Rig, t: number, seat = 0.42) {
  resetLimbs(r);
  r.root.position.y = 0;
  r.hips.position.y = seat;
  r.body.rotation.set(0.12, Math.sin(t * 0.6) * 0.06, 0);
  r.head.rotation.set(Math.sin(t * 0.8) * 0.06, Math.sin(t * 0.5) * 0.25, 0);
  r.legL.rotation.set(-1.45, 0, 0.12);
  r.legR.rotation.set(-1.45, 0, -0.12);
  r.shinL.rotation.set(1.45, 0, 0);
  r.shinR.rotation.set(1.45, 0, 0);
  r.armL.rotation.set(-0.7, 0, -0.1);
  r.armR.rotation.set(-0.7, 0, 0.1);
  r.foreL.rotation.set(-0.5, 0, 0);
  r.foreR.rotation.set(-0.5, 0, 0);
}

export function cheerPose(r: Rig, t: number) {
  resetLimbs(r);
  const j = Math.abs(Math.sin(t * 9));
  r.root.position.y = j * 0.18;
  r.body.rotation.set(-0.08, 0, 0);
  r.head.rotation.set(-0.25, 0, Math.sin(t * 9) * 0.1);
  r.armL.rotation.set(0, 0, -2.7 + Math.sin(t * 12) * 0.25);
  r.armR.rotation.set(0, 0, 2.7 - Math.sin(t * 12) * 0.25);
  r.foreL.rotation.set(0, 0, -0.3);
  r.foreR.rotation.set(0, 0, 0.3);
  r.legL.rotation.set(-0.2 * j, 0, 0.1);
  r.legR.rotation.set(-0.2 * j, 0, -0.1);
  r.shinL.rotation.set(0.4 * j, 0, 0);
  r.shinR.rotation.set(0.4 * j, 0, 0);
}

export function clapPose(r: Rig, t: number) {
  standPose(r, t, 0.3);
  const c = Math.abs(Math.sin(t * 10));
  r.armL.rotation.set(-1.1, 0, -0.25 - c * 0.25);
  r.armR.rotation.set(-1.1, 0, 0.25 + c * 0.25);
  r.foreL.rotation.set(-0.7, 0.4, 0);
  r.foreR.rotation.set(-0.7, -0.4, 0);
}

export function runPose(r: Rig, cycle: number) {
  resetLimbs(r);
  const s = Math.sin(cycle);
  r.root.position.y = Math.abs(Math.cos(cycle)) * 0.07;
  r.body.rotation.set(0.25, 0, 0);
  r.head.rotation.set(-0.2, 0, 0);
  r.legL.rotation.set(s * 0.85, 0, 0);
  r.legR.rotation.set(-s * 0.85, 0, 0);
  r.shinL.rotation.set(0.25 + Math.max(0, s) * 1.2, 0, 0);
  r.shinR.rotation.set(0.25 + Math.max(0, -s) * 1.2, 0, 0);
  r.armL.rotation.set(-s * 0.9, 0, -0.1);
  r.armR.rotation.set(s * 0.9, 0, 0.1);
  r.foreL.rotation.set(-1.3, 0, 0);
  r.foreR.rotation.set(-1.3, 0, 0);
}

/** Bowling: right arm windmills over the top; action 0..1 to release, >1 follow-through. */
export function bowlPose(r: Rig, action: number) {
  resetLimbs(r);
  const a = Math.min(action, 1);
  r.root.position.y = Math.sin(a * Math.PI) * 0.12;
  r.body.rotation.set(-0.2 + a * 0.6, 0, 0);
  r.head.rotation.set(0.1, 0, 0);
  r.armR.rotation.set(Math.PI * 0.9 - a * Math.PI * 1.7 - Math.max(0, action - 1) * 0.6, 0, 0.1);
  r.armL.rotation.set(-2.2 + a * 2.6, 0, -0.2);
  r.foreL.rotation.set(-0.4 * (1 - a), 0, 0);
  r.legL.rotation.set(-0.7 + a * 0.4, 0, 0);
  r.shinL.rotation.set(0.3, 0, 0);
  r.legR.rotation.set(0.5 - a * 0.9, 0, 0);
  r.shinR.rotation.set(0.6 * (1 - a), 0, 0);
}

export function divePose(r: Rig, t: number, dir: number) {
  resetLimbs(r);
  r.body.rotation.set(0, 0, dir * 0.3 * t);
  r.root.rotation.z = dir * 1.25 * t;
  r.root.position.y = Math.sin(t * Math.PI) * 0.6;
  r.armL.rotation.set(0, 0, -2.9);
  r.armR.rotation.set(0, 0, 2.9);
  r.legL.rotation.set(0.3, 0, 0.5);
  r.legR.rotation.set(-0.3, 0, -0.5);
  r.shinL.rotation.set(0.6, 0, 0);
  r.shinR.rotation.set(0.3, 0, 0);
}

export interface BatKey {
  hands: V3;
  dir: V3;
}

const hv = new THREE.Vector3();
const dv = new THREE.Vector3();
const tgt = new THREE.Vector3();
const pole = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const qInv = new THREE.Quaternion();
const qFore = new THREE.Quaternion();

/** Two-bone IK: aim shoulder+elbow so the hand lands on `target` (in the body's space). */
function solveArm(shoulder: THREE.Group, elbow: THREE.Group, target: THREE.Vector3, poleDir: THREE.Vector3) {
  const S = shoulder.position;
  const D = tmp.copy(target).sub(S);
  const d = Math.min(D.length(), (UPPER + FORE) * 0.999);
  D.normalize();
  const a = Math.acos(THREE.MathUtils.clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
  const perp = pole.copy(poleDir).addScaledVector(D, -poleDir.dot(D)).normalize();
  const upperDir = new THREE.Vector3().copy(D).multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));
  shoulder.quaternion.setFromUnitVectors(DOWN, upperDir);
  const E = new THREE.Vector3().copy(S).addScaledVector(upperDir, UPPER);
  const foreDir = new THREE.Vector3().copy(target).sub(E).normalize();
  qFore.setFromUnitVectors(DOWN, foreDir);
  qInv.copy(shoulder.quaternion).invert();
  elbow.quaternion.copy(qInv.multiply(qFore));
}

const POLE_L = new THREE.Vector3(-0.6, -1, -0.2);
const POLE_R = new THREE.Vector3(0.6, -1, -0.2);

/** Place hands and bat. Hands/dir are in the character's (unscaled) local space. */
export function batPose(r: Rig, k: BatKey, crouch = 0.08) {
  if (!r.bat) return;
  resetLimbs(r);
  r.root.position.y = 0;
  r.hips.position.y = HIP_Y - crouch;
  r.legL.rotation.set(-0.35, 0, 0.2);
  r.legR.rotation.set(0.15, 0, -0.2);
  r.shinL.rotation.set(0.45, 0, 0);
  r.shinR.rotation.set(0.35, 0, 0);
  r.body.rotation.set(0.18, Math.atan2(k.hands[0], 0.6) * 0.5, 0);

  hv.set(...k.hands);
  dv.set(...k.dir).normalize();
  r.bat.position.copy(hv);
  r.bat.quaternion.setFromUnitVectors(DOWN, dv);

  // Convert the hand targets from root space into the torso's space.
  r.hips.updateMatrix();
  r.body.updateMatrix();
  m4.multiplyMatrices(r.hips.matrix, r.body.matrix).invert();
  tgt.copy(hv).applyMatrix4(m4);
  solveArm(r.armL, r.foreL, tgt, POLE_L);
  tgt.copy(hv).addScaledVector(dv, 0.1).applyMatrix4(m4);
  solveArm(r.armR, r.foreR, tgt, POLE_R);
}

export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
