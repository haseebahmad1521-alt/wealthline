import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

import type { Outfit } from '../data/players';

// Big-headed, animated-film style street cricketers built from primitives.
// Facing +Z in local space. About 1.6 m tall including the oversized head.

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  bat: THREE.Group | null;
}

export const SHOULDER_Y = 1.02;
export const SHOULDER_X = 0.24;
const ARM_LEN = 0.46;

interface Props {
  outfit: Outfit;
  rig: MutableRefObject<Rig | null>;
  batter?: boolean;
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  headband?: boolean;
}

function useMats(outfit: Outfit) {
  return useMemo(() => {
    const cloth = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88 });
    return {
      skin: new THREE.MeshStandardMaterial({ color: outfit.skin, roughness: 0.5 }),
      cheek: new THREE.MeshStandardMaterial({ color: new THREE.Color(outfit.skin).lerp(new THREE.Color('#E0707A'), 0.35), roughness: 0.5 }),
      top: cloth(outfit.top),
      bottom: cloth(outfit.bottom),
      hair: new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.65 }),
      white: new THREE.MeshStandardMaterial({ color: '#F7F5F0', roughness: 0.25 }),
      iris: new THREE.MeshStandardMaterial({ color: '#6B3A1A', roughness: 0.2 }),
      pupil: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.1 }),
      shine: new THREE.MeshBasicMaterial({ color: '#FFFFFF' }),
      mouth: new THREE.MeshStandardMaterial({ color: '#5A1A1A', roughness: 0.6 }),
      pad: new THREE.MeshStandardMaterial({ color: '#F2EEE4', roughness: 0.7 }),
      shoe: cloth(outfit.kind === 'shalwar' ? '#5B3A22' : '#C1272D'),
      sole: cloth('#F2F2F2'),
      cap: cloth('#C1272D'),
      capFront: cloth('#F2EEE4'),
      band: cloth('#D62828'),
      topi: cloth('#F7F4EC'),
      wood: new THREE.MeshStandardMaterial({ color: '#E2C08D', roughness: 0.7 }),
      grip: cloth('#C1272D'),
      sticker: cloth('#D62828'),
    };
  }, [outfit]);
}

const geo = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  dome: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 14),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 18),
  skirt: new THREE.CylinderGeometry(0.21, 0.29, 1, 20, 1, true),
  box: new THREE.BoxGeometry(1, 1, 1),
  smile: new THREE.CircleGeometry(1, 20, Math.PI, Math.PI),
};

const capsuleCache = new Map<string, THREE.CapsuleGeometry>();
function capsuleGeo(r: number, len: number) {
  const key = `${r}:${len}`;
  let g = capsuleCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, 6, 14);
    capsuleCache.set(key, g);
  }
  return g;
}

/** Capsule of radius r with a straight section `len` long, centred at pos. */
function Cap({ r, len, pos, mat, scale = [1, 1, 1] }: { r: number; len: number; pos: [number, number, number]; mat: THREE.Material; scale?: [number, number, number] }) {
  return <mesh geometry={capsuleGeo(r, len)} material={mat} position={pos} scale={scale} />;
}

function Head({ m, outfit, headband }: { m: ReturnType<typeof useMats>; outfit: Outfit; headband?: boolean }) {
  const eyes = [-1, 1].map((s) => (
    <group key={s} position={[s * 0.1, 0.02, 0.215]}>
      <mesh geometry={geo.sphere} material={m.white} scale={[0.078, 0.092, 0.05]} />
      <mesh geometry={geo.sphere} material={m.iris} position={[0, -0.005, 0.034]} scale={[0.05, 0.058, 0.025]} />
      <mesh geometry={geo.sphere} material={m.pupil} position={[0, -0.005, 0.05]} scale={[0.026, 0.03, 0.014]} />
      <mesh geometry={geo.sphere} material={m.shine} position={[0.016, 0.02, 0.062]} scale={0.011} />
      <mesh geometry={geo.box} material={m.hair} position={[0, 0.115, 0.01]} rotation={[0, 0, s * -0.18]} scale={[0.11, 0.026, 0.04]} />
    </group>
  ));
  return (
    <group>
      <mesh geometry={geo.cylinder} material={m.skin} position={[0, -0.27, 0]} scale={[0.07, 0.12, 0.07]} />
      <mesh geometry={geo.sphere} material={m.skin} scale={[0.27, 0.26, 0.255]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.sphere} material={m.skin} position={[s * 0.262, -0.01, -0.01]} scale={[0.04, 0.07, 0.055]} />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.sphere} material={m.cheek} position={[s * 0.16, -0.07, 0.19]} scale={[0.055, 0.04, 0.03]} />
      ))}
      {eyes}
      <mesh geometry={geo.sphere} material={m.cheek} position={[0, -0.045, 0.255]} scale={[0.048, 0.04, 0.04]} />
      {/* Big grin */}
      <mesh geometry={geo.smile} material={m.mouth} position={[0, -0.11, 0.232]} rotation={[-0.25, 0, 0]} scale={[0.075, 0.055, 1]} />
      <mesh geometry={geo.box} material={m.white} position={[0, -0.118, 0.238]} rotation={[-0.25, 0, 0]} scale={[0.11, 0.022, 0.004]} />
      {/* Messy hair */}
      <mesh geometry={geo.dome} material={m.hair} position={[0, 0.06, -0.02]} rotation={[-0.45, 0, 0]} scale={[0.29, 0.27, 0.29]} />
      {[
        [0.0, 0.2, 0.17, 0.09],
        [-0.12, 0.17, 0.16, 0.08],
        [0.13, 0.16, 0.15, 0.08],
        [-0.22, 0.06, 0.05, 0.08],
        [0.22, 0.06, 0.05, 0.08],
        [0.0, 0.05, -0.24, 0.11],
        [-0.15, 0.0, -0.18, 0.1],
        [0.15, 0.0, -0.18, 0.1],
        [0.06, 0.27, 0.0, 0.1],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} geometry={geo.sphere} material={m.hair} position={[x, y, z]} scale={r} />
      ))}
      {outfit.headwear === 'cap' && (
        <group position={[0, 0.1, 0]} rotation={[-0.25, 0, 0]}>
          <mesh geometry={geo.dome} material={m.cap} scale={[0.29, 0.22, 0.29]} />
          <mesh geometry={geo.dome} material={m.capFront} position={[0, 0, 0.012]} scale={[0.2, 0.2, 0.285]} />
          <mesh geometry={geo.cylinder} material={m.cap} position={[0, 0.0, 0.29]} scale={[0.17, 0.02, 0.15]} />
        </group>
      )}
      {outfit.headwear === 'topi' && <mesh geometry={geo.cylinder} material={m.topi} position={[0, 0.25, -0.02]} rotation={[-0.2, 0, 0]} scale={[0.22, 0.09, 0.22]} />}
      {headband && outfit.headwear === 'none' && (
        <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2 - 0.25, 0, 0]}>
          <torusGeometry args={[0.268, 0.024, 8, 28]} />
          <primitive object={m.band} attach="material" />
        </mesh>
      )}
    </group>
  );
}

function Arm({ m, outfit, batter }: { m: ReturnType<typeof useMats>; outfit: Outfit; batter?: boolean }) {
  const sleeveFull = outfit.kind !== 'tshirt';
  return (
    <group>
      <Cap r={0.065} len={0.16} pos={[0, -0.13, 0]} mat={m.top} />
      <Cap r={0.055} len={0.14} pos={[0, -0.32, 0]} mat={sleeveFull ? m.top : m.skin} />
      {batter ? (
        <mesh geometry={geo.sphere} material={m.pad} position={[0, -ARM_LEN, 0.01]} scale={[0.085, 0.1, 0.075]} />
      ) : (
        <mesh geometry={geo.sphere} material={m.skin} position={[0, -ARM_LEN, 0]} scale={0.065} />
      )}
    </group>
  );
}

function Leg({ m, outfit, batter }: { m: ReturnType<typeof useMats>; outfit: Outfit; batter?: boolean }) {
  const baggy = outfit.kind === 'shalwar' || outfit.kind === 'kurta';
  return (
    <group>
      <Cap r={baggy ? 0.1 : 0.08} len={0.32} pos={[0, -0.25, 0]} mat={m.bottom} />
      {batter && (
        <group position={[0, -0.33, 0.06]}>
          <mesh geometry={geo.capsule} material={m.pad} scale={[0.1, 0.13, 0.07]} />
          {[-0.1, 0, 0.1].map((y) => (
            <mesh key={y} geometry={geo.box} material={m.pad} position={[0, y, 0.06]} scale={[0.17, 0.03, 0.03]} />
          ))}
        </group>
      )}
      <group position={[0, -0.56, 0.04]}>
        <mesh geometry={geo.sphere} material={m.shoe} scale={[0.085, 0.06, 0.14]} />
        <mesh geometry={geo.box} material={m.sole} position={[0, -0.04, 0]} scale={[0.16, 0.03, 0.27]} />
      </group>
    </group>
  );
}

function Bat({ m }: { m: ReturnType<typeof useMats> }) {
  return (
    <group>
      <mesh geometry={geo.cylinder} material={m.grip} position={[0, -0.12, 0]} scale={[0.022, 0.26, 0.022]} />
      <mesh geometry={geo.box} material={m.wood} position={[0, -0.55, 0]} scale={[0.12, 0.62, 0.04]} />
      <mesh geometry={geo.box} material={m.sticker} position={[0, -0.42, 0.022]} scale={[0.1, 0.1, 0.004]} />
    </group>
  );
}

export function Chibi({ outfit, rig, batter, position = [0, 0, 0], rotationY = 0, scale = 1, headband }: Props) {
  const m = useMats(outfit);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const bat = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!root.current) return;
    root.current.traverse((o) => {
      o.castShadow = true;
    });
    rig.current = {
      root: root.current,
      body: body.current!,
      head: head.current!,
      armL: armL.current!,
      armR: armR.current!,
      legL: legL.current!,
      legR: legR.current!,
      bat: bat.current,
    };
  }, [rig]);

  const tunic = outfit.kind === 'shalwar' || outfit.kind === 'kurta';
  return (
    <group ref={root} position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <group ref={legL} position={[-0.1, 0.62, 0]}>
        <Leg m={m} outfit={outfit} batter={batter} />
      </group>
      <group ref={legR} position={[0.1, 0.62, 0]}>
        <Leg m={m} outfit={outfit} batter={batter} />
      </group>
      <group ref={body} position={[0, 0.62, 0]}>
        <Cap r={0.2} len={0.2} pos={[0, 0.2, 0]} mat={m.top} scale={[1.05, 1, 0.82]} />
        {tunic ? (
          <mesh geometry={geo.skirt} material={m.top} position={[0, -0.1, 0]} scale={[1, outfit.kind === 'shalwar' ? 0.42 : 0.34, 0.85]} />
        ) : (
          <mesh geometry={geo.skirt} material={m.top} position={[0, 0.0, 0]} scale={[1, 0.16, 0.82]} />
        )}
        {[0.34, 0.24, 0.14].map((y) => (
          <mesh key={y} geometry={geo.sphere} material={m.white} position={[0, y, 0.165]} scale={0.013} />
        ))}
        <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.025, 6, 16]} />
          <primitive object={m.top} attach="material" />
        </mesh>
      </group>
      <group ref={head} position={[0, 1.32, 0]}>
        <Head m={m} outfit={outfit} headband={headband} />
      </group>
      <group ref={armL} position={[-SHOULDER_X, SHOULDER_Y, 0]}>
        <Arm m={m} outfit={outfit} batter={batter} />
      </group>
      <group ref={armR} position={[SHOULDER_X, SHOULDER_Y, 0]}>
        <Arm m={m} outfit={outfit} batter={batter} />
      </group>
      {batter && (
        <group ref={bat}>
          <Bat m={m} />
        </group>
      )}
    </group>
  );
}

// ---------- Poses ----------

const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();

/** Point a limb group (hanging along -Y) toward a local-space target. */
export function aimLimb(limb: THREE.Group, target: THREE.Vector3) {
  tmp.copy(target).sub(limb.position).normalize();
  limb.quaternion.setFromUnitVectors(DOWN, tmp);
}

export function standPose(r: Rig, t: number, sway = 1) {
  r.root.position.y = 0;
  r.body.rotation.set(0, Math.sin(t * 1.3) * 0.04 * sway, 0);
  r.head.rotation.set(Math.sin(t * 0.9) * 0.05, Math.sin(t * 0.7) * 0.15 * sway, 0);
  r.armL.rotation.set(0, 0, -0.15);
  r.armR.rotation.set(0, 0, 0.15);
  r.legL.rotation.set(0, 0, 0.04);
  r.legR.rotation.set(0, 0, -0.04);
}

export function readyPose(r: Rig, t: number) {
  // Fielder crouched, hands on knees.
  r.root.position.y = -0.1 + Math.sin(t * 2) * 0.01;
  r.body.rotation.set(0.35, 0, 0);
  r.head.rotation.set(-0.25, 0, 0);
  r.armL.rotation.set(-0.6, 0, -0.2);
  r.armR.rotation.set(-0.6, 0, 0.2);
  r.legL.rotation.set(-0.35, 0, 0.12);
  r.legR.rotation.set(-0.35, 0, -0.12);
}

export function cheerPose(r: Rig, t: number) {
  const j = Math.abs(Math.sin(t * 9));
  r.root.position.y = j * 0.18;
  r.body.rotation.set(-0.05, 0, 0);
  r.head.rotation.set(-0.2, 0, Math.sin(t * 9) * 0.1);
  r.armL.rotation.set(0, 0, -2.6 + Math.sin(t * 12) * 0.3);
  r.armR.rotation.set(0, 0, 2.6 - Math.sin(t * 12) * 0.3);
  r.legL.rotation.set(0, 0, 0.1);
  r.legR.rotation.set(0, 0, -0.1);
}

export function runPose(r: Rig, cycle: number) {
  const s = Math.sin(cycle);
  r.root.position.y = Math.abs(Math.cos(cycle)) * 0.08;
  r.body.rotation.set(0.2, 0, 0);
  r.head.rotation.set(-0.15, 0, 0);
  r.legL.rotation.set(s * 0.9, 0, 0);
  r.legR.rotation.set(-s * 0.9, 0, 0);
  r.armL.rotation.set(-s * 0.9, 0, -0.1);
  r.armR.rotation.set(s * 0.9, 0, 0.1);
}

/** Bowling: right arm windmills over the top; action 0..1 to release, >1 follow-through. */
export function bowlPose(r: Rig, action: number) {
  const a = Math.min(action, 1);
  r.root.position.y = Math.sin(Math.min(1, a) * Math.PI) * 0.12;
  r.body.rotation.set(-0.15 + a * 0.5, 0, 0);
  r.head.rotation.set(0.1, 0, 0);
  // Arm swings back-up-over-forward (rotation about X, negative = forward).
  r.armR.rotation.set(Math.PI * 0.9 - a * Math.PI * 1.7 - Math.max(0, action - 1) * 0.6, 0, 0.1);
  r.armL.rotation.set(-1.8 + a * 2.2, 0, -0.2);
  r.legL.rotation.set(-0.6 + a * 0.3, 0, 0);
  r.legR.rotation.set(0.5 - a * 0.9, 0, 0);
}

export function divePose(r: Rig, t: number, dir: number) {
  r.body.rotation.set(0, 0, dir * 1.2 * t);
  r.root.rotation.z = dir * 1.1 * t;
  r.root.position.y = Math.sin(t * Math.PI) * 0.6;
  r.armL.rotation.set(0, 0, -2.8);
  r.armR.rotation.set(0, 0, 2.8);
  r.legL.rotation.set(0.3, 0, 0.5);
  r.legR.rotation.set(-0.3, 0, -0.5);
}

export interface BatKey {
  hands: [number, number, number];
  dir: [number, number, number];
}

const hv = new THREE.Vector3();
const dv = new THREE.Vector3();
const off = new THREE.Vector3();

/** Place hands and bat. Hands/dir are in the character's local space. */
export function batPose(r: Rig, k: BatKey, crouch = 0.08) {
  if (!r.bat) return;
  r.root.position.y = -crouch;
  r.legL.rotation.set(-0.25, 0, 0.18);
  r.legR.rotation.set(0.2, 0, -0.18);
  hv.set(...k.hands);
  dv.set(...k.dir).normalize();
  r.bat.position.copy(hv);
  r.bat.quaternion.setFromUnitVectors(DOWN, dv);
  // Both hands on the handle, one slightly below the other.
  off.copy(dv).multiplyScalar(0.12);
  r.armL.rotation.set(0, 0, 0);
  r.armR.rotation.set(0, 0, 0);
  aimArm(r.armL, hv);
  aimArm(r.armR, off.add(hv));
  r.body.rotation.set(0.15, Math.atan2(k.hands[0], 0.6) * 0.6, 0);
}

function aimArm(arm: THREE.Group, hand: THREE.Vector3) {
  tmp.copy(hand).sub(arm.position);
  const len = tmp.length();
  tmp.normalize();
  arm.quaternion.setFromUnitVectors(DOWN, tmp);
  arm.scale.set(1, Math.min(1.25, Math.max(0.7, len / ARM_LEN)), 1);
}

export const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
