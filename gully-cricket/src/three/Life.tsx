import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { City } from '../data/cities';
import type { Build, OutfitKind } from '../data/players';
import { Builder, compose, hashSeed, seeded } from './builder';
import { useFrame } from './fiber';

// Everyday gully life around the match: cats, a goat waiting for Eid, uncle
// on his charpai, the chai khokha, a fruit rehri, a CD70 with a cat on the
// seat, pigeons and dust hanging in the evening light.

type V3 = [number, number, number];
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

/** Where neighbours sit or stand to watch. Positions in metres. */
export interface Spectator {
  pos: V3;
  rotY: number;
  pose: 'sit' | 'stand' | 'clap' | 'akimbo' | 'lean';
  build: Build;
  kind?: OutfitKind;
  /** Height of the surface they sit on. */
  seat?: number;
}

export const SPECTATORS: Spectator[] = [
  // Kids on the stoop, left side.
  { pos: [-3.05, 0, -6.6], rotY: Math.PI / 2 - 0.3, pose: 'sit', build: 'kid', seat: 0.32 },
  { pos: [-3.05, 0, -7.5], rotY: Math.PI / 2 - 0.1, pose: 'sit', build: 'kid', seat: 0.32 },
  // Uncle on the charpai with the newspaper.
  { pos: [-2.55, 0, -11.2], rotY: Math.PI / 2 - 0.4, pose: 'sit', build: 'uncle', kind: 'shalwar', seat: 0.5 },
  // Men at the chai stall bench.
  { pos: [-2.2, 0, -21.3], rotY: Math.PI / 2 + 0.3, pose: 'sit', build: 'uncle', seat: 0.45 },
  { pos: [-2.2, 0, -22.3], rotY: Math.PI / 2 + 0.6, pose: 'sit', build: 'teen', seat: 0.45 },
  // Kids standing on the right, close to the action.
  { pos: [2.75, 0.18, -2.6], rotY: -Math.PI / 2 + 0.5, pose: 'clap', build: 'kid' },
  { pos: [3.15, 0.18, -3.4], rotY: -Math.PI / 2 + 0.3, pose: 'akimbo', build: 'kid' },
  { pos: [2.9, 0.18, -4.4], rotY: -Math.PI / 2 + 0.2, pose: 'stand', build: 'teen' },
  // Man on a plastic chair.
  { pos: [3.0, 0.18, -18.2], rotY: -Math.PI / 2 + 0.2, pose: 'sit', build: 'uncle', seat: 0.62 },
  // Watching from a balcony.
  { pos: [-3.05, 3.15, -5.2], rotY: Math.PI / 2, pose: 'lean', build: 'uncle', kind: 'kurta' },
];

// ---------------- Static props (one merged mesh) ----------------

function buildProps(city: City): THREE.BufferGeometry {
  const b = new Builder();
  const rng = seeded(hashSeed(city.id) ^ 0x77);
  const wheel = new THREE.TorusGeometry(1, 0.13, 8, 22);

  // Stoop where the kids sit.
  b.box('#B9AE9E', [0.7, 0.3, 2.0], [-3.25, 0.15, -7.0]);
  b.box('#A39888', [0.5, 0.15, 2.0], [-3.35, 0.38, -7.0]);

  // Charpai: wooden frame, legs and woven rope.
  {
    const cx = -2.6;
    const cz = -11.2;
    for (const dx of [-0.42, 0.42]) for (const dz of [-0.9, 0.9]) b.cylinder('#7A4B26', 0.04, 0.45, [cx + dx, 0.225, cz + dz]);
    for (const dx of [-0.42, 0.42]) b.box('#8A5A33', [0.07, 0.07, 1.9], [cx + dx, 0.42, cz]);
    for (const dz of [-0.9, 0.9]) b.box('#8A5A33', [0.9, 0.07, 0.07], [cx, 0.42, cz + dz]);
    b.box('#D8C49A', [0.8, 0.02, 1.76], [cx, 0.43, cz]);
    for (let i = -6; i <= 6; i++) b.box('#B89F6E', [0.012, 0.025, 1.76], [cx + i * 0.06, 0.435, cz]);
    for (let i = -14; i <= 14; i++) b.box('#B89F6E', [0.8, 0.025, 0.012], [cx, 0.436, cz + i * 0.06]);
    // Steel cup of chai on the side.
    b.cylinder('#C9CED3', 0.04, 0.09, [cx + 0.25, 0.49, cz + 0.6]);
  }

  // Goat's peg and rope.
  b.cylinder('#6B4226', 0.03, 0.5, [-3.25, 0.25, -15.6]);

  // Chai khokha: counter, tin roof, stove, kettle, glasses, benches.
  {
    const x = -3.0;
    const z = -22;
    b.box('#5C8D89', [1.0, 1.0, 2.0], [x - 0.1, 0.5, z]);
    b.box('#E8D9B5', [1.05, 0.08, 2.05], [x - 0.1, 1.04, z]);
    b.box('#9AA0A6', [1.6, 0.05, 2.6], [x + 0.1, 2.35, z], [0, 0, -0.18]);
    for (const dz of [-1.2, 1.2]) b.cylinder('#5A5550', 0.04, 1.35, [x + 0.65, 1.6, z + dz]);
    b.box(['#E63946', '#FFB703', '#2A9D8F'][Math.floor(rng() * 3)], [0.06, 0.4, 1.8], [x + 0.45, 1.85, z]);
    b.cylinder('#2B2B2B', 0.12, 0.12, [x + 0.05, 1.14, z - 0.5]);
    b.cylinder('#B8BEC4', 0.13, 0.22, [x + 0.05, 1.32, z - 0.5], [0, 0, 0], 0.7);
    b.cylinder('#B8BEC4', 0.02, 0.14, [x + 0.2, 1.33, z - 0.5], [0, 0, -1.0]);
    for (let i = 0; i < 6; i++) b.cylinder('#E9E2C8', 0.03, 0.08, [x + 0.15, 1.12, z + 0.1 + i * 0.09]);
    // Benches.
    for (const dz of [-0.4, -1.4]) {
      b.box('#7A4B26', [0.35, 0.05, 1.0], [-2.2, 0.42, z + dz + 0.6]);
      for (const ddz of [-0.42, 0.42]) b.box('#5B3A1E', [0.3, 0.4, 0.05], [-2.2, 0.2, z + dz + 0.6 + ddz]);
    }
  }

  // Fruit rehri: cart with bananas, oranges and apples.
  {
    const x = 2.45;
    const z = -14;
    b.box('#8A5A33', [0.9, 0.08, 1.7], [x, 0.78, z]);
    b.box('#6B4226', [0.95, 0.12, 0.05], [x, 0.86, z - 0.85]);
    b.box('#6B4226', [0.95, 0.12, 0.05], [x, 0.86, z + 0.85]);
    for (const dx of [-0.48, 0.48]) b.add(wheel, '#2B2B2B', compose([x + dx, 0.4, z], [0, Math.PI / 2, 0], [0.38, 0.38, 0.38]));
    b.box('#6B4226', [0.05, 0.05, 0.9], [x, 0.72, z - 1.2]);
    for (let i = 0; i < 26; i++) b.sphere('#F28C28', 0.06, [x - 0.3 + (i % 6) * 0.12, 0.88 + Math.floor(i / 18) * 0.08, z - 0.75 + Math.floor(i / 6) * 0.11]);
    for (let i = 0; i < 6; i++) {
      const bz = z + 0.2 + (i % 3) * 0.2;
      for (let k = 0; k < 5; k++) b.cylinder('#F2D04B', 0.025, 0.2, [x - 0.2 + (i > 2 ? 0.3 : 0) + k * 0.035, 0.9, bz], [0.25, 0, 0.6 - k * 0.2]);
    }
    for (let i = 0; i < 12; i++) b.sphere('#C81D25', 0.055, [x + 0.25 - (i % 3) * 0.1, 0.87, z + 0.25 + Math.floor(i / 3) * 0.12]);
  }

  // Honda CD70-style motorbike, the gully's favourite ride.
  {
    const x = -2.45;
    const z = -4.0;
    const r: V3 = [0, 0.35, 0];
    const at = (dx: number, y: number, dz: number): V3 => [x + dx * Math.cos(0.35) + dz * Math.sin(0.35), y, z - dx * Math.sin(0.35) + dz * Math.cos(0.35)];
    for (const dz of [-0.62, 0.62]) b.add(wheel, '#1E1E1E', compose(at(0, 0.3, dz), [0, Math.PI / 2 + 0.35, 0], [0.29, 0.29, 0.29]));
    b.box('#C1272D', [0.24, 0.18, 0.45], at(0, 0.78, 0.18), r);
    b.box('#1E1E1E', [0.26, 0.09, 0.55], at(0, 0.8, -0.28), r);
    b.box('#8E9599', [0.18, 0.2, 0.3], at(0, 0.5, 0.0), r);
    b.cylinder('#B8BEC4', 0.035, 0.75, at(0.12, 0.38, -0.3), [Math.PI / 2, 0.35, 0]);
    b.cylinder('#2B2B2B', 0.02, 0.6, at(0, 0.85, 0.62), [0, 0, Math.PI / 2]);
    b.cylinder('#B8BEC4', 0.025, 0.5, at(0, 0.62, 0.58), [0.35, 0, 0]);
    b.sphere('#F4F1DE', 0.07, at(0, 0.85, 0.72));
    b.box('#C1272D', [0.2, 0.05, 0.35], at(0, 0.6, -0.68), r);
  }

  // Bicycle leaning on the wall.
  {
    const x = 3.25;
    const z = -5.2;
    for (const dz of [-0.5, 0.5]) b.add(wheel, '#1E1E1E', compose([x, 0.34, z + dz], [0, Math.PI / 2, 0.08], [0.32, 0.32, 0.32]));
    b.cylinder('#1D5FA8', 0.022, 0.62, [x - 0.02, 0.52, z], [Math.PI / 2, 0, 0.08]);
    b.cylinder('#1D5FA8', 0.022, 0.55, [x - 0.03, 0.55, z - 0.22], [0.5, 0, 0.08]);
    b.cylinder('#1D5FA8', 0.022, 0.55, [x - 0.03, 0.55, z + 0.25], [-0.4, 0, 0.08]);
    b.box('#2B2B2B', [0.08, 0.04, 0.2], [x - 0.04, 0.82, z - 0.3]);
    b.cylinder('#B8BEC4', 0.015, 0.45, [x - 0.04, 0.88, z + 0.42], [0, 0, Math.PI / 2]);
  }

  // White monobloc chairs.
  for (const [x, z, ry] of [[3.0, -18.2, -0.2], [2.95, -19.3, 0.3]] as const) {
    const at = (dx: number, y: number, dz: number): V3 => [x + dx * Math.cos(ry) + dz * Math.sin(ry), y, z - dx * Math.sin(ry) + dz * Math.cos(ry)];
    b.box('#F2F2EE', [0.46, 0.05, 0.44], at(0, 0.45, 0), [0, ry, 0]);
    b.box('#F2F2EE', [0.46, 0.45, 0.04], at(0.22, 0.7, 0), [0, ry + Math.PI / 2, 0]);
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.19, 0.19]) b.cylinder('#E6E6E2', 0.025, 0.45, at(dx, 0.22, dz));
  }

  // Balcony for the watching uncle.
  b.box('#F6EEDF', [1.0, 0.15, 1.6], [-3.1, 3.05, -5.2]);
  b.box('#2E9C8A', [0.06, 0.06, 1.6], [-2.62, 4.05, -5.2]);
  for (let i = 0; i <= 6; i++) b.box('#2E9C8A', [0.04, 0.9, 0.04], [-2.62, 3.6, -6.0 + i * 0.27]);

  // Neem tree spilling over a compound wall.
  b.cylinder('#6B4A2F', 0.22, 5, [3.9, 2.5, -16.5], [0, 0, 0.12]);
  b.cylinder('#6B4A2F', 0.1, 2.2, [3.2, 4.8, -16.5], [0.2, 0, 0.7]);
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.4 + rng() * 1.5;
    b.sphere(['#4E8B3A', '#3E7A2E', '#5E9E45'][i % 3], 0.35 + rng() * 0.35, [3.4 + Math.cos(a) * r, 5.0 + rng() * 2.2, -16.5 + Math.sin(a) * r * 1.2]);
  }

  // Street surface details: patched asphalt, brick paving, manhole, puddle edge.
  b.box('#8E8378', [1.6, 0.012, 2.2], [-1.6, 0.006, -16]);
  b.box('#9A8F82', [1.1, 0.012, 1.4], [1.9, 0.006, -27]);
  for (let i = 0; i < 40; i++) {
    const r0 = Math.floor(i / 8);
    const c0 = i % 8;
    b.box(i % 3 ? '#B5674A' : '#A65A3F', [0.22, 0.014, 0.1], [1.4 + c0 * 0.23 + (r0 % 2) * 0.11, 0.007, -30 - r0 * 0.11]);
  }
  b.cylinder('#5E5A55', 0.35, 0.02, [0.9, 0.01, -19]);
  b.cylinder('#4C4844', 0.28, 0.022, [0.9, 0.012, -19]);

  // Posters and painted wall ads at street level.
  const posterCols = ['#E63946', '#FFB703', '#2A9D8F', '#F1FAEE', '#8338EC', '#1D3557'];
  for (let i = 0; i < 16; i++) {
    const s = i % 2 ? 1 : -1;
    const z = -3 - rng() * 34;
    const w = 0.4 + rng() * 0.5;
    b.box(posterCols[Math.floor(rng() * posterCols.length)], [0.02, w * 1.3, w], [s * 3.57, 1.3 + rng() * 0.6, z]);
  }
  // Drain pipes down the walls.
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1;
    b.cylinder('#7D7A75', 0.06, 9, [s * 3.5, 4.5, -2 - i * 5.3]);
  }
  // Satellite dishes and outdoor AC units.
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    const z = -4 - i * 6.5;
    b.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, 0.9), '#E8E8E8', compose([s * 3.3, 6.6 + (i % 3), z], [0, 0, s * 1.2], [0.4, 0.15, 0.4]));
    b.box('#D9D9D6', [0.4, 0.45, 0.65], [s * 3.38, 3.9 + (i % 2) * 3, z - 2.4]);
    b.box('#9A9A96', [0.02, 0.3, 0.3], [s * 3.17, 3.9 + (i % 2) * 3, z - 2.4]);
  }

  // Street lamp.
  b.cylinder('#5A5550', 0.07, 6, [3.35, 3, -11.5]);
  b.box('#5A5550', [0.9, 0.06, 0.06], [2.95, 5.95, -11.5]);
  b.box('#F4E6B0', [0.35, 0.1, 0.2], [2.55, 5.9, -11.5]);

  return b.build();
}

/** Sagging tangle of electric and cable-TV wires between poles and walls. */
function buildWires(): THREE.BufferGeometry {
  const b = new Builder();
  const rng = seeded(1234);
  const poles: V3[] = [[-3.35, 8.4, -6], [3.35, 8.4, -17], [-3.35, 8.4, -29], [3.35, 8.4, -41]];
  const spans: [V3, V3][] = [];
  for (let i = 0; i < poles.length - 1; i++) spans.push([poles[i], poles[i + 1]]);
  for (let i = 0; i < 11; i++) {
    const s = rng() < 0.5 ? -1 : 1;
    const z = -6 - rng() * 36;
    spans.push([[s * 3.55, 6.5 + rng() * 3, z], [-s * 3.55, 6.5 + rng() * 3, z - 2 + rng() * 4]]);
  }
  for (const p of poles) for (let k = 0; k < 3; k++) spans.push([p, [p[0] < 0 ? -3.55 : 3.55, 6 + k, p[2] + (k - 1) * 3]]);
  for (const [a, c] of spans) {
    const mid = new THREE.Vector3((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 0.6 - rng() * 0.8, (a[2] + c[2]) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), mid, new THREE.Vector3(...c));
    const tube = new THREE.TubeGeometry(curve, 16, 0.012, 4, false);
    b.add(tube, '#1E1E1E', new THREE.Matrix4());
    tube.dispose();
  }
  return b.build();
}

// ---------------- Animated animals ----------------

interface CatParts {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  legs: THREE.Group[];
}

function catGeos(fur: string, belly: string, stripe: string | null) {
  const body = new Builder();
  body.sphere(fur, 1, [0, 0, 0], [0.1, 0.095, 0.21]);
  body.sphere(belly, 1, [0, -0.03, 0.08], [0.075, 0.07, 0.1]);
  if (stripe) for (let i = -2; i <= 2; i++) body.box(stripe, [0.16, 0.012, 0.03], [0, 0.085, i * 0.07], [0, 0, 0]);
  const head = new Builder();
  head.sphere(fur, 1, [0, 0, 0], [0.085, 0.078, 0.08]);
  head.sphere(belly, 1, [0, -0.025, 0.06], [0.045, 0.035, 0.035]);
  for (const s of [-1, 1]) {
    head.add(new THREE.ConeGeometry(1, 1, 4), fur, compose([s * 0.05, 0.075, -0.005], [0, 0, s * -0.25], [0.035, 0.07, 0.025]));
    head.sphere('#9BD35A', 0.017, [s * 0.032, 0.012, 0.068]);
    head.box('#111111', [0.006, 0.022, 0.006], [s * 0.032, 0.012, 0.084]);
    for (const k of [-1, 1]) head.box('#F0F0F0', [0.09, 0.002, 0.002], [s * 0.07, -0.025 + k * 0.008, 0.07], [0, s * 0.3, k * 0.12]);
  }
  head.sphere('#E58A9A', 0.012, [0, -0.008, 0.095]);
  const tail = new Builder();
  for (let i = 0; i < 6; i++) tail.sphere(i === 5 && stripe ? stripe : fur, 0.025 - i * 0.002, [0, Math.sin(i * 0.5) * 0.08 + i * 0.03, -i * 0.045]);
  const leg = new Builder();
  leg.cylinder(fur, 0.022, 0.15, [0, -0.075, 0]);
  leg.sphere(belly, 0.025, [0, -0.15, 0.01]);
  return { body: body.build(), head: head.build(), tail: tail.build(), leg: leg.build() };
}

function Cat({
  fur,
  belly,
  stripe,
  animate,
}: {
  fur: string;
  belly: string;
  stripe: string | null;
  animate: (c: CatParts, t: number) => void;
}) {
  const g = useMemo(() => catGeos(fur, belly, stripe), [fur, belly, stripe]);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group[]>([]);
  useFrame(({ clock }) => {
    if (!root.current || !body.current || !head.current || !tail.current) return;
    animate({ root: root.current, body: body.current, head: head.current, tail: tail.current, legs: legs.current }, clock.getElapsedTime());
  });
  return (
    <group ref={root}>
      <group ref={body} position={[0, 0.2, 0]}>
        <mesh geometry={g.body} material={MAT} castShadow />
        <group ref={head} position={[0, 0.08, 0.2]}>
          <mesh geometry={g.head} material={MAT} castShadow />
        </group>
        <group ref={tail} position={[0, 0.04, -0.2]}>
          <mesh geometry={g.tail} material={MAT} />
        </group>
        {[[-0.055, 0.12], [0.055, 0.12], [-0.055, -0.13], [0.055, -0.13]].map(([x, z], i) => (
          <group
            key={i}
            position={[x, -0.04, z]}
            ref={(el) => {
              if (el) legs.current[i] = el;
            }}
          >
            <mesh geometry={g.leg} material={MAT} />
          </group>
        ))}
      </group>
    </group>
  );
}

/** Crosses the street, sits on the far pavement, crosses back. */
function walkingCat(c: CatParts, t: number) {
  const period = 26;
  const p = (t % period) / period;
  const z = -6.9;
  let x: number;
  let walking = true;
  let dir = 1;
  if (p < 0.38) x = -3.2 + (p / 0.38) * 6.4;
  else if (p < 0.5) {
    x = 3.2;
    walking = false;
  } else if (p < 0.88) {
    x = 3.2 - ((p - 0.5) / 0.38) * 6.4;
    dir = -1;
  } else {
    x = -3.2;
    walking = false;
    dir = -1;
  }
  c.root.position.set(x, x > 2.95 || x < -2.95 ? 0.18 : 0, z);
  c.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  const w = t * 9;
  c.legs.forEach((l, i) => (l.rotation.x = walking ? Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0));
  c.body.position.y = walking ? 0.2 + Math.abs(Math.sin(w)) * 0.01 : 0.13;
  c.body.rotation.x = walking ? 0 : -0.35;
  c.head.rotation.set(walking ? 0 : -0.2, walking ? Math.sin(t * 0.8) * 0.3 : Math.sin(t * 0.5) * 0.8, 0);
  c.tail.rotation.set(0.3 + Math.sin(t * 2) * 0.2, Math.sin(t * 1.6) * 0.5, 0);
}

function lickingCat(c: CatParts, t: number) {
  // Sitting on the motorbike seat, washing a paw.
  c.root.position.set(-2.6, 0.82, -4.3);
  c.root.rotation.y = 0.9;
  c.body.position.y = 0.13;
  c.body.rotation.x = -0.45;
  c.legs.forEach((l, i) => (l.rotation.x = i === 0 ? -1.2 + Math.sin(t * 6) * 0.2 : i > 1 ? 1.2 : 0));
  c.head.rotation.set(0.5 + Math.sin(t * 6) * 0.15, -0.3, 0);
  c.tail.rotation.set(-0.6, Math.sin(t * 1.2) * 0.4, 0);
}

function sleepingCat(c: CatParts, t: number) {
  c.root.position.set(3.15, 0.18, -10.2);
  c.root.rotation.y = 0.4;
  c.body.position.y = 0.08;
  c.body.scale.set(1, 1 + Math.sin(t * 1.5) * 0.04, 1);
  c.legs.forEach((l) => (l.rotation.x = 1.5));
  c.head.rotation.set(0.6, -1.2, 0.3);
  c.tail.rotation.set(-1.0, 2.2, 0);
}

function Goat() {
  const g = useMemo(() => {
    const body = new Builder();
    body.sphere('#F2EFE8', 1, [0, 0, 0], [0.17, 0.17, 0.33]);
    body.sphere('#8A5A33', 1, [0.06, 0.06, -0.08], [0.12, 0.1, 0.16]);
    for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) {
      body.cylinder('#EDE8DE', 0.03, 0.42, [x, -0.25, z]);
      body.box('#3A2A20', [0.05, 0.04, 0.06], [x, -0.46, z]);
    }
    body.add(new THREE.ConeGeometry(1, 1, 6), '#F2EFE8', compose([0, 0.1, -0.35], [-1.0, 0, 0], [0.03, 0.12, 0.03]));
    // Red rope collar and rope to the peg.
    body.cylinder('#C1272D', 0.07, 0.04, [0, 0.12, 0.3], [1.2, 0, 0]);
    const head = new Builder();
    head.sphere('#F2EFE8', 1, [0, 0, 0.06], [0.08, 0.09, 0.15]);
    head.sphere('#E8C8B8', 1, [0, -0.03, 0.18], [0.05, 0.05, 0.05]);
    for (const s of [-1, 1]) {
      head.sphere('#F2EFE8', 1, [s * 0.1, 0.01, 0.0], [0.08, 0.025, 0.04]);
      head.add(new THREE.ConeGeometry(1, 1, 6), '#A89F8F', compose([s * 0.035, 0.1, -0.03], [-0.5, 0, s * 0.2], [0.018, 0.1, 0.018]));
      head.sphere('#2B1D14', 0.015, [s * 0.05, 0.03, 0.12]);
    }
    head.cylinder('#DDD6C8', 0.02, 0.07, [0, -0.1, 0.12]);
    return { body: body.build(), head: head.build() };
  }, []);
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (head.current) {
      head.current.rotation.x = 0.4 + Math.max(0, Math.sin(t * 0.7)) * 0.5;
      head.current.rotation.y = Math.sin(t * 0.4) * 0.3;
      head.current.position.y = 0.2 + Math.sin(t * 7) * 0.006;
    }
  });
  return (
    <group position={[-2.75, 0.5, -15.2]} rotation={[0, 2.4, 0]}>
      <mesh geometry={g.body} material={MAT} castShadow />
      <group ref={head} position={[0, 0.2, 0.33]}>
        <mesh geometry={g.head} material={MAT} castShadow />
      </group>
    </group>
  );
}

function Pigeons() {
  const birds = useRef<THREE.Group[]>([]);
  const wings = useRef<THREE.Mesh[]>([]);
  const geo = useMemo(() => {
    const body = new Builder();
    body.sphere('#7D8794', 1, [0, 0, 0], [0.08, 0.07, 0.16]);
    body.sphere('#5D6A78', 0.055, [0, 0.04, 0.13]);
    const wing = new Builder();
    wing.box('#8E98A6', [0.28, 0.015, 0.12], [0.14, 0, 0]);
    return { body: body.build(), wing: wing.build() };
  }, []);
  const n = 9;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    birds.current.forEach((b, i) => {
      const a = t * 0.35 + (i / n) * Math.PI * 2 * 0.35;
      const r = 9 + (i % 3) * 1.5;
      b.position.set(Math.cos(a) * r, 17 + Math.sin(a * 2 + i) * 1.2, -24 + Math.sin(a) * r);
      b.rotation.y = -a;
      b.scale.setScalar(1.6);
    });
    wings.current.forEach((w, j) => {
      const flap = Math.sin(t * 14 + Math.floor(j / 2)) * 0.7;
      w.rotation.z = j % 2 ? -flap : Math.PI + flap;
    });
  });
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) birds.current[i] = el;
          }}
        >
          <mesh geometry={geo.body} material={MAT} />
          {[0, 1].map((k) => (
            <mesh
              key={k}
              geometry={geo.wing}
              material={MAT}
              ref={(el) => {
                if (el) wings.current[i * 2 + k] = el;
              }}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/** Pigeons perched along a roof edge, bobbing. */
function Perched() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const b = new Builder();
    for (let i = 0; i < 6; i++) {
      const x = -3.3;
      const z = -9 - i * 0.45 - (i > 2 ? 1 : 0);
      b.sphere('#7D8794', 1, [x, 0, z], [0.07, 0.07, 0.11]);
      b.sphere('#5D6A78', 0.045, [x + 0.05, 0.06, z]);
    }
    return b.build();
  }, []);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 6.9 + Math.abs(Math.sin(clock.getElapsedTime() * 3)) * 0.02;
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} material={MAT} />
    </group>
  );
}

function Steam() {
  const puffs = useRef<THREE.Mesh[]>([]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.35, depthWrite: false }), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    puffs.current.forEach((m, i) => {
      const a = ((t * 0.5 + i / 5) % 1);
      m.position.set(-2.8 + Math.sin(t + i) * 0.05, 1.6 + a * 0.8, -22.5 + Math.cos(t * 0.7 + i) * 0.05);
      m.scale.setScalar(0.05 + a * 0.15);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - a);
    });
  });
  return (
    <group>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          material={mat.clone()}
          ref={(el) => {
            if (el) puffs.current[i] = el;
          }}
        >
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Dust motes drifting through the warm light. */
function softDot(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, 1 - d) ** 2 * 255;
      data.set([255, 255, 255, a], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
}

function Motes() {
  const ref = useRef<THREE.Points>(null);
  const dot = useMemo(softDot, []);
  const geo = useMemo(() => {
    const rng = seeded(7);
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rng() * 2 - 1) * 3.2;
      pos[i * 3 + 1] = rng() * 6;
      pos[i * 3 + 2] = -3 - rng() * 28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.set(Math.sin(t * 0.2) * 0.3, Math.sin(t * 0.15) * 0.25, 0);
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#FFE2A8" map={dot} alphaMap={dot} size={0.045} transparent opacity={0.65} depthWrite={false} />
    </points>
  );
}

/** Newspaper for the uncle on the charpai. */
function Newspaper() {
  return (
    <mesh position={[-2.2, 0.98, -11.0]} rotation={[0, Math.PI / 2 - 0.4, -0.2]}>
      <boxGeometry args={[0.02, 0.32, 0.46]} />
      <meshStandardMaterial color="#EDE9DD" roughness={0.9} />
    </mesh>
  );
}

export function Life({ city }: { city: City }) {
  const props = useMemo(() => buildProps(city), [city]);
  const wires = useMemo(buildWires, []);
  return (
    <group>
      <mesh geometry={props} material={MAT} castShadow receiveShadow />
      <mesh geometry={wires} material={MAT} />
      <Cat fur="#E39B4B" belly="#F6E3C8" stripe="#B86A2A" animate={walkingCat} />
      <Cat fur="#2B2B2B" belly="#F2F2F2" stripe={null} animate={lickingCat} />
      <Cat fur="#D9D9D9" belly="#FFFFFF" stripe="#8E8E8E" animate={sleepingCat} />
      <Goat />
      <Pigeons />
      <Perched />
      <Steam />
      <Motes />
      <Newspaper />
    </group>
  );
}
