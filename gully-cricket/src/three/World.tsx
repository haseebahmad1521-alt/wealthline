import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { City, Landmark } from '../data/cities';
import { M, RELEASE_Z } from '../game/perspective';
import { Builder, hashSeed, seeded } from './builder';
import { useFrame } from './fiber';

// The gully in 3D: painted houses with balconies and shutters, bunting,
// kites, a cycle rickshaw, wires and a dusty street. Everything static is
// merged into a few vertex-coloured meshes.

const HALF = 3; // half street width in metres
const WALL = 3.6; // house fronts
const STREET_END = -58;

const vertexMat = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return c;
}

const CLOTHES = ['#E63946', '#F1FAEE', '#457B9D', '#FFB703', '#2A9D8F', '#C77DFF', '#FB8500'];
const SIGNS = ['#E63946', '#2A9D8F', '#F4A261', '#1D3557', '#FFB703', '#6A4C93'];

function buildHouses(city: City): THREE.BufferGeometry {
  const rng = seeded(hashSeed(city.id));
  const b = new Builder();
  const p = city.palette;
  const cream = '#F6EEDF';
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];

  for (const s of [-1, 1] as const) {
    const inward = -s;
    const face = s * WALL;
    let z = 8;
    while (z > STREET_END) {
      const w = 4.5 + rng() * 3.2;
      const zc = z - w / 2;
      const floors = 2 + Math.floor(rng() * (city.style === 'apartment' || city.style === 'gulf' ? 3 : 2.4));
      const H = floors * 3 + 0.4;
      const wall = pick(p.walls);
      const shutter = pick([p.trim, '#2E9C8A', '#2F6B45', '#3A86C8', '#C8553D']);
      const ledge = city.style === 'haveli' ? shade(wall, -0.15) : cream;

      // Main body.
      b.box(wall, [6, H, w - 0.05], [s * (WALL + 3), H / 2, zc]);
      // Plinth.
      b.box(shade(wall, -0.18), [0.2, 0.55, w], [face + inward * 0.05, 0.27, zc]);
      if (city.style === 'tiles') b.box('#2F6DB5', [0.12, 0.6, w], [face + inward * 0.08, 0.85, zc]);

      // Ground floor: shop shutter or wooden door.
      const shop = rng() < 0.5;
      if (shop) {
        b.box('#9AA0A6', [0.1, 2.3, Math.min(2.6, w - 1)], [face + inward * 0.04, 1.4, zc]);
        for (let r = 0; r < 6; r++) b.box('#7B8187', [0.12, 0.05, Math.min(2.6, w - 1)], [face + inward * 0.06, 0.5 + r * 0.36, zc]);
        b.box(pick(SIGNS), [0.12, 0.55, Math.min(3, w - 0.6)], [face + inward * 0.1, 2.85, zc]);
        // Striped awning.
        b.box(pick(['#E63946', '#2A9D8F', '#F4A261']), [1.1, 0.06, Math.min(3, w - 0.6)], [face + inward * 0.55, 3.25, zc], [0, 0, s * -0.35]);
      } else {
        b.box(cream, [0.12, 2.4, 1.4], [face + inward * 0.04, 1.25, zc]);
        b.box(city.style === 'colonial' ? '#2F6B45' : '#6B4226', [0.14, 2.2, 1.1], [face + inward * 0.06, 1.15, zc]);
        b.cylinder('#C9A227', 0.04, 0.04, [face + inward * 0.15, 1.15, zc + 0.35], [0, 0, Math.PI / 2]);
        // Steps where neighbours sit.
        b.box('#B8AFA3', [0.6, 0.18, 1.6], [face + inward * 0.3, 0.09, zc]);
      }

      // Upper floors.
      const cols = Math.max(1, Math.floor(w / 2));
      for (let f = 1; f < floors; f++) {
        const y0 = f * 3;
        b.box(ledge, [0.3, 0.2, w + 0.1], [face + inward * 0.15, y0, zc]);
        const balcony = rng() < 0.55;
        for (let c = 0; c < cols; c++) {
          const wz = zc + w / 2 - (c + 0.5) * (w / cols);
          b.box(cream, [0.1, 1.7, 1.2], [face + inward * 0.04, y0 + 1.45, wz]);
          b.box(p.window, [0.12, 1.45, 0.92], [face + inward * 0.06, y0 + 1.42, wz]);
          // Arched top.
          if (city.style !== 'apartment' && city.style !== 'gulf') {
            b.cylinder(cream, 0.6, 0.1, [face + inward * 0.04, y0 + 2.3, wz], [0, 0, Math.PI / 2]);
            b.cylinder(p.window, 0.46, 0.12, [face + inward * 0.06, y0 + 2.2, wz], [0, 0, Math.PI / 2]);
          }
          // Open shutters.
          b.box(shutter, [0.08, 1.45, 0.48], [face + inward * 0.12, y0 + 1.42, wz + 0.72]);
          b.box(shutter, [0.08, 1.45, 0.48], [face + inward * 0.12, y0 + 1.42, wz - 0.72]);
          if (city.style === 'gulf' && rng() < 0.5) b.box('#E2E2E2', [0.5, 0.4, 0.6], [face + inward * 0.3, y0 + 0.45, wz]);
          if (city.style === 'haveli' && rng() < 0.5) {
            // Carved jharoka box.
            b.box('#6B4226', [0.8, 1.9, 1.5], [face + inward * 0.4, y0 + 1.4, wz]);
            b.box(p.window, [0.1, 1.3, 1.0], [face + inward * 0.82, y0 + 1.45, wz]);
            b.box('#8A5A33', [0.95, 0.15, 1.7], [face + inward * 0.45, y0 + 2.42, wz]);
          }
        }
        if (balcony) {
          const bw = w * 0.8;
          const out = city.style === 'chawl' ? 1.1 : 0.9;
          b.box(cream, [out, 0.16, bw], [face + inward * (out / 2), y0 + 0.1, zc]);
          const rail = city.style === 'chawl' ? '#3E6B5A' : pick([p.trim, '#2E9C8A', '#6B4226', '#2F6B45']);
          b.box(rail, [0.07, 0.07, bw], [face + inward * (out - 0.04), y0 + 1.05, zc]);
          const posts = Math.floor(bw / 0.28);
          for (let i = 0; i <= posts; i++) {
            b.box(rail, [0.04, 0.9, 0.04], [face + inward * (out - 0.04), y0 + 0.6, zc - bw / 2 + i * (bw / posts)]);
          }
          // Plants and drying clothes.
          for (let i = 0; i < 3; i++) {
            if (rng() < 0.5) {
              const pz = zc - bw / 2 + 0.4 + rng() * (bw - 0.8);
              b.cylinder('#B5562D', 0.14, 0.22, [face + inward * (out - 0.05), y0 + 1.2, pz], [0, 0, 0], 1.2);
              b.sphere('#3E8E41', 0.22, [face + inward * (out - 0.05), y0 + 1.42, pz], [1, 0.8, 1]);
            }
          }
          for (let i = 0; i < 4; i++) {
            if (rng() < 0.45) {
              const pz = zc - bw / 2 + 0.3 + rng() * (bw - 0.6);
              b.box(pick(CLOTHES), [0.04, 0.6, 0.45], [face + inward * (out + 0.02), y0 + 0.75, pz]);
            }
          }
        }
      }

      // Roofline: cornice, parapet, tiled overhang, water tank.
      b.box(ledge, [0.5, 0.35, w + 0.25], [face + inward * 0.2, H - 0.1, zc]);
      b.box(wall, [0.25, 0.7, w], [face + inward * 0.05, H + 0.35, zc]);
      if (rng() < 0.4) {
        b.box('#B5562D', [1.4, 0.12, w + 0.3], [face + inward * 0.4, H + 0.55, zc], [0, 0, s * 0.35]);
      }
      if (rng() < 0.6) {
        const tank = city.region === 'india' && rng() < 0.6 ? '#1C1C1C' : pick(['#1C1C1C', '#2F6DB5', '#E8E1D0']);
        b.cylinder(tank, 0.55, 1.1, [s * (WALL + 1.6), H + 0.6, zc + (rng() - 0.5) * 2]);
      }
      if (rng() < 0.5) b.sphere('#4C9A3E', 0.6, [s * (WALL + 0.8), H + 0.6, zc - 1], [1, 0.8, 1]);

      z -= w;
    }
  }

  // Houses closing the end of the street.
  for (let i = -2; i <= 2; i++) {
    const h = 6 + rng() * 6;
    b.box(pick(p.walls), [5.2, h, 6], [i * 5.2, h / 2, STREET_END - 4]);
    b.box('#F6EEDF', [5.3, 0.3, 0.4], [i * 5.2, h, STREET_END - 0.95]);
  }

  // Sidewalks, open drains and loose rocks on the street.
  for (const s of [-1, 1]) {
    b.box('#B9AE9E', [0.6, 0.18, 70], [s * (HALF + 0.3), 0.09, -22]);
    b.box('#4A4038', [0.18, 0.03, 70], [s * (HALF - 0.08), 0.01, -22]);
  }
  for (let i = 0; i < 70; i++) {
    const x = (rng() * 2 - 1) * (HALF - 0.2);
    const zz = 3 - rng() * 40;
    if (Math.abs(x) < 0.9 && zz < 1 && zz > -21) continue; // keep the pitch clear
    b.sphere(pick(['#9C8B78', '#B4A28C', '#857565']), 0.05 + rng() * 0.12, [x, 0.02, zz], [1.3, 0.55, 1]);
  }
  // Bricks as stumps at the bowler's end.
  const bz = -RELEASE_Z * M - 1.2;
  b.box('#A63D2A', [0.5, 0.18, 0.25], [0, 0.09, bz]);
  b.box('#B5462F', [0.45, 0.18, 0.25], [0.02, 0.27, bz]);
  b.box('#A63D2A', [0.4, 0.18, 0.25], [-0.02, 0.45, bz]);
  // Chalk creases.
  b.box('#F5F2EA', [1.8, 0.012, 0.07], [0, 0.006, -2.6]);
  b.box('#F5F2EA', [1.8, 0.012, 0.07], [0, 0.006, bz + 0.9]);

  // Electricity poles.
  for (const [s, zz] of [[-1, -6], [1, -17], [-1, -29], [1, -41]] as const) {
    b.cylinder('#5A5550', 0.12, 9, [s * (HALF + 0.35), 4.5, zz]);
    b.box('#5A5550', [1.4, 0.12, 0.12], [s * (HALF + 0.35), 8.4, zz]);
    b.box('#3B3B3B', [0.5, 0.6, 0.35], [s * (HALF + 0.1), 6.2, zz]);
  }

  // Cycle rickshaw parked at the side.
  const rx = city.region === 'neutral' ? -2.2 : 2.2;
  const rz = -9;
  const body = city.region === 'pakistan' ? '#2B7DE9' : city.region === 'india' ? '#2E8B57' : '#C1272D';
  for (const dz of [-0.6, 0.6]) b.add(new THREE.TorusGeometry(0.42, 0.05, 8, 24), '#222222', new THREE.Matrix4().makeTranslation(rx + dz * 0.0 + (dz < 0 ? -0.55 : 0.55), 0.45, rz + 0.4).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  b.add(new THREE.TorusGeometry(0.38, 0.05, 8, 24), '#222222', new THREE.Matrix4().makeTranslation(rx, 0.42, rz - 1.4).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  b.box(body, [1.2, 0.5, 0.9], [rx, 1.0, rz + 0.4]);
  b.box('#B22234', [1.1, 0.35, 0.6], [rx, 1.35, rz + 0.55]);
  b.box('#FFB703', [1.22, 0.08, 0.92], [rx, 0.8, rz + 0.4]);
  b.dome(city.region === 'india' ? '#F6C33B' : '#1E3A5F', 0.75, [rx, 1.55, rz + 0.55], 0.9);
  b.box('#555555', [0.06, 0.06, 1.8], [rx, 0.8, rz - 0.5]);
  b.box('#333333', [0.3, 0.08, 0.35], [rx, 1.2, rz - 1.2]);

  return b.build();
}

function buildLandmark(kind: Landmark, color: string): THREE.BufferGeometry {
  const b = new Builder();
  switch (kind) {
    case 'minar':
      b.box(color, [14, 1.5, 14], [0, 0.75, 0]);
      b.cylinder(color, 1.6, 34, [0, 18, 0], [0, 0, 0], 0.45);
      b.cylinder(color, 2.2, 0.6, [0, 14, 0]);
      b.cylinder(color, 1.6, 0.6, [0, 26, 0]);
      b.sphere(color, 1.2, [0, 35.5, 0]);
      b.dome(color, 5, [-16, 6, 4], 1.3);
      b.box(color, [12, 6, 8], [-16, 3, 4]);
      break;
    case 'mazar':
      b.box(color, [16, 9, 16], [0, 4.5, 0]);
      b.dome(color, 7.5, [0, 9, 0], 1.25);
      b.cylinder(color, 0.25, 4, [0, 19.5, 0]);
      break;
    case 'tomb':
      b.cylinder(color, 10, 10, [0, 5, 0], [0, 0, 0], 0.85);
      b.cylinder(color, 7, 6, [0, 13, 0]);
      b.dome(color, 7, [0, 16, 0], 1.1);
      break;
    case 'towers':
      for (const [x, h] of [[-22, 30], [-12, 46], [-2, 38], [10, 54], [22, 34], [32, 42]]) b.box(color, [8, h, 8], [x, h / 2, 0]);
      break;
    case 'masjid':
      b.box(color, [30, 7, 10], [0, 3.5, 0]);
      b.dome(color, 6, [0, 7, 0], 1.3);
      b.dome(color, 4, [-10, 7, 0], 1.2);
      b.dome(color, 4, [10, 7, 0], 1.2);
      for (const x of [-17, 17]) {
        b.cylinder(color, 0.9, 26, [x, 13, 0]);
        b.sphere(color, 1.4, [x, 27, 0]);
      }
      break;
    case 'bridge':
      for (const x of [-16, 16]) b.box(color, [2, 32, 2], [x, 16, 0]);
      b.box(color, [70, 1.2, 2], [0, 6, 0]);
      b.box(color, [36, 1, 1], [0, 30, 0]);
      for (const [x, r] of [[-26, 0.6], [26, -0.6], [-8, -0.9], [8, 0.9]]) b.box(color, [1, 26, 1], [x, 18, 0], [0, 0, r]);
      break;
    case 'charminar':
      b.box(color, [16, 14, 16], [0, 7, 0]);
      for (const x of [-7.5, 7.5]) {
        b.cylinder(color, 1, 30, [x, 15, 0]);
        b.sphere(color, 1.5, [x, 30.5, 0]);
      }
      b.box(color, [17, 1.5, 17], [0, 15, 0]);
      break;
    case 'burj':
      b.cylinder(color, 4, 30, [0, 15, 0], [0, 0, 0], 0.7);
      b.cylinder(color, 2.8, 30, [0, 45, 0], [0, 0, 0], 0.55);
      b.cylinder(color, 1.5, 30, [0, 75, 0], [0, 0, 0], 0.3);
      b.cylinder(color, 0.4, 16, [0, 98, 0], [0, 0, 0], 0.2);
      b.box(color, [8, 24, 8], [18, 12, 6]);
      b.box(color, [7, 18, 7], [-16, 9, 6]);
      break;
  }
  return b.build();
}

/** Strings of triangular flags across the street. */
function buildBunting(seed: number): THREE.BufferGeometry {
  const rng = seeded(seed);
  const colors = ['#E63946', '#FFB703', '#2A9D8F', '#3A86C8', '#F1FAEE', '#8338EC', '#FB8500', '#2B9348'];
  const positions: number[] = [];
  const cols: number[] = [];
  const n = 16;
  const sag = 0.9;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = -WALL + t * WALL * 2;
    const y = -sag * 4 * t * (1 - t);
    c.set(colors[Math.floor(rng() * colors.length)]);
    const tri = [x - 0.17, y, 0, x + 0.17, y, 0, x, y - 0.42, 0];
    positions.push(...tri);
    for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
  }
  // The string itself as thin quads.
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const x0 = -WALL + t0 * WALL * 2;
    const x1 = -WALL + t1 * WALL * 2;
    const y0 = -sag * 4 * t0 * (1 - t0);
    const y1 = -sag * 4 * t1 * (1 - t1);
    positions.push(x0, y0 + 0.02, 0, x1, y1 + 0.02, 0, x1, y1 - 0.02, 0, x0, y0 + 0.02, 0, x1, y1 - 0.02, 0, x0, y0 - 0.02, 0);
    for (let k = 0; k < 6; k++) cols.push(0.2, 0.2, 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function buildSky(top: string, bottom: string): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(400, 24, 16);
  const pos = g.getAttribute('position');
  const a = new THREE.Color(bottom);
  const t = new THREE.Color(top);
  const cols: number[] = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 400;
    tmp.copy(a).lerp(t, Math.min(1, Math.max(0, (y + 0.02) * 2.2)));
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

function groundTexture(base: string): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const c = new THREE.Color(base);
  const rng = seeded(99);
  for (let i = 0; i < size * size; i++) {
    const n = (rng() - 0.5) * 0.16 + (rng() < 0.04 ? -0.12 : 0);
    data[i * 4] = Math.max(0, Math.min(255, (c.r + n) * 255));
    data[i * 4 + 1] = Math.max(0, Math.min(255, (c.g + n * 0.9) * 255));
    data[i * 4 + 2] = Math.max(0, Math.min(255, (c.b + n * 0.8) * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 30);
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function Kite({ x, y, z, color, phase }: { x: number; y: number; z: number; color: string; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, 0, -0.7, 0, 0, 0, -0.9, 0, 0, 0.9, 0, 0, -0.9, 0, 0.7, 0, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    if (!ref.current) return;
    ref.current.position.set(x + Math.sin(t * 0.7) * 1.2, y + Math.sin(t * 1.3) * 0.6, z);
    ref.current.rotation.z = Math.sin(t * 1.1) * 0.25;
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.sin(i) * 0.1, -1.1 - i * 0.35, 0]} rotation={[0, 0, 0.785]}>
          <planeGeometry args={[0.18, 0.18]} />
          <meshStandardMaterial color={i % 2 ? '#FFB703' : '#E63946'} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Cloud({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={scale}>
      {[
        [0, 0, 0, 3],
        [3, 0.6, 0, 2.4],
        [-3, 0.3, 0, 2.2],
        [1.4, 1.8, 0, 2.2],
        [-1.5, 1.4, 0.4, 1.9],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 16, 12]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#FFF4E6" emissiveIntensity={0.55} roughness={1} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

function Bunting({ z, y, seed }: { z: number; y: number; seed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => buildBunting(seed), [seed]);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.x = Math.sin(clock.getElapsedTime() * 1.6 + seed) * 0.12;
  });
  return (
    <mesh ref={ref} geometry={geo} position={[0, y, z]}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.7} />
    </mesh>
  );
}

export function World({ city }: { city: City }) {
  const p = city.palette;
  const houses = useMemo(() => buildHouses(city), [city]);
  const landmark = useMemo(() => buildLandmark(city.landmark, '#' + shade(p.haze, -0.12).getHexString()), [city, p.haze]);
  const sky = useMemo(() => buildSky(p.skyTop, p.skyBottom), [p.skyTop, p.skyBottom]);
  const ground = useMemo(() => groundTexture('#C9A57E'), []);
  const mat = useMemo(vertexMat, []);
  const seed = hashSeed(city.id);

  return (
    <group>
      <fog attach="fog" args={[p.skyBottom, 28, 95]} />
      <hemisphereLight args={[p.skyTop, '#C9A57E', 1.1]} />
      <ambientLight intensity={0.25} color="#FFE8CC" />
      <directionalLight
        position={[-9, 26, 16]}
        intensity={2.6}
        color="#FFD7A0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={14}
        shadow-camera-bottom={-40}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />

      <mesh geometry={sky}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      <mesh geometry={landmark} position={[city.landmark === 'towers' ? 0 : 8, 0, -120]} scale={1.4}>
        <meshBasicMaterial color={'#' + shade(p.haze, -0.1).getHexString()} fog={false} />
      </mesh>
      <Cloud position={[-30, 42, -110]} scale={2.2} />
      <Cloud position={[34, 50, -130]} scale={2.6} />
      <Cloud position={[6, 60, -160]} scale={3} />
      <Cloud position={[-60, 30, -90]} scale={1.8} />

      {/* Street surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -25]} receiveShadow>
        <planeGeometry args={[HALF * 2 + 1.4, 80]} />
        <meshStandardMaterial map={ground} roughness={1} />
      </mesh>
      {/* Worn pitch strip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -10]} receiveShadow>
        <planeGeometry args={[1.8, 22]} />
        <meshStandardMaterial color="#D8BE96" roughness={1} />
      </mesh>

      <mesh geometry={houses} material={mat} castShadow receiveShadow />

      <Bunting z={-4} y={7.2} seed={seed + 1} />
      <Bunting z={-11} y={8.4} seed={seed + 2} />
      <Bunting z={-19} y={7.6} seed={seed + 3} />
      <Bunting z={-28} y={8.8} seed={seed + 4} />
      <Bunting z={-38} y={8} seed={seed + 5} />

      <Kite x={-6} y={22} z={-40} color="#E63946" phase={0} />
      <Kite x={9} y={28} z={-55} color="#2A9D8F" phase={2} />
      {city.hasKite && <Kite x={2} y={18} z={-30} color="#8338EC" phase={4} />}
      {city.hasKite && <Kite x={-12} y={32} z={-70} color="#FFB703" phase={1} />}
    </group>
  );
}
