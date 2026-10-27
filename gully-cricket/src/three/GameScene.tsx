import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

import type { City } from '../data/cities';
import { makeOutfit, randomOutfitKind, type Outfit } from '../data/players';
import { computeFrame, type FrameState, type Live } from '../game/frame';
import type { WorldPos } from '../game/flight';
import { BATTER, BOWLER_RELEASE, BOWLER_START_Z, FIELDERS, M, STUMPS_Z, clamp01 } from '../game/perspective';
import { Builder, hashSeed, seeded } from './builder';
import {
  Chibi,
  akimboPose,
  batPose,
  bowlPose,
  cheerPose,
  clapPose,
  divePose,
  lerp3,
  readyPose,
  runPose,
  sitPose,
  standPose,
  type BatKey,
  type Rig,
} from './Chibi';
import { Life, SPECTATORS, type Spectator } from './Life';
import { useFrame, useThree } from './fiber';
import { World } from './World';

const v = (p: WorldPos, out = new THREE.Vector3()) => out.set(p.x * M, p.h * M, -p.z * M);

// Batting keyframes in the batter's local space (+X points at the bowler).
const KEYS: Record<'stance' | 'backlift' | 'contact' | 'ground' | 'lofted', BatKey> = {
  stance: { hands: [-0.04, 1.0, 0.22], dir: [-0.45, 0.85, -0.15] },
  backlift: { hands: [-0.12, 1.1, 0.16], dir: [-0.62, 0.72, -0.3] },
  contact: { hands: [0.12, 0.74, 0.3], dir: [0.2, -0.92, 0.4] },
  ground: { hands: [0.22, 0.98, 0.16], dir: [0.75, 0.55, 0.15] },
  lofted: { hands: [0.22, 1.32, 0.26], dir: [0.15, 0.9, -0.45] },
};

function mixKey(a: BatKey, b: BatKey, t: number): BatKey {
  return { hands: lerp3(a.hands, b.hands, t), dir: lerp3(a.dir, b.dir, t) };
}

function buildStumpsBase(): THREE.BufferGeometry {
  const b = new Builder();
  b.box('#3A3A3A', [0.34, 0.05, 0.22], [0, 0.025, 0]);
  b.box('#B8BEC4', [0.3, 0.02, 0.06], [0, 0.06, 0]);
  return b.build();
}

function buildStump(): THREE.BufferGeometry {
  const b = new Builder();
  b.cylinder('#E9D2A6', 0.02, 0.7, [0, 0.35, 0]);
  b.sphere('#E9D2A6', 0.02, [0, 0.7, 0]);
  b.cylinder('#C1272D', 0.021, 0.05, [0, 0.62, 0]);
  return b.build();
}

interface Props {
  city: City;
  batterOutfit: Outfit;
  bowlerOutfit: Outfit;
  /** Live game state; omit for the menu showcase. */
  live?: MutableRefObject<Live>;
}

export function GameScene({ city, batterOutfit, bowlerOutfit, live }: Props) {
  const batter = useRef<Rig | null>(null);
  const bowler = useRef<Rig | null>(null);
  const fielderRigs = useRef<(Rig | null)[]>([]);
  const fanRigs = useRef<(Rig | null)[]>([]);
  const ball = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Mesh[]>([]);
  const ring = useRef<THREE.Mesh>(null);
  const crate = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const dust = useRef<THREE.Mesh[]>([]);
  const dustState = useRef<{ t0: number; x: number; z: number }[]>([]);
  const lastBounce = useRef({ t0: -1, did: false, swing: -1 });
  const camPos = useRef(new THREE.Vector3(0.9, 2.0, 3.6));
  const camLook = useRef(new THREE.Vector3(-1.4, 0.9, -10));
  const history = useRef<THREE.Vector3[]>([]);
  const { camera } = useThree();

  const stumpsGeo = useMemo(() => ({ base: buildStumpsBase(), stump: buildStump() }), []);
  const woodMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), []);
  const stumps = useRef<THREE.Group[]>([]);
  const bails = useRef<THREE.Mesh[]>([]);

  const extras = useMemo(() => {
    const rng = seeded(hashSeed(city.id) ^ 0x5151);
    const region = city.region;
    const fielders = FIELDERS.map(() => makeOutfit(randomOutfitKind(region, rng), rng, { region, build: rng() < 0.3 ? 'kid' : 'teen' }));
    const fans = SPECTATORS.map((sp) => makeOutfit(sp.kind ?? randomOutfitKind(region, rng), rng, { region, build: sp.build }));
    return { fielders, fans };
  }, [city]);

  const spawnDust = (now: number, x: number, z: number) => {
    const list = dustState.current;
    list.push({ t0: now, x, z });
    if (list.length > dust.current.length) list.shift();
  };

  useFrame(({ clock }, delta) => {
    const now = performance.now();
    const t = clock.getElapsedTime();
    const fs: FrameState | null = live ? computeFrame(live.current, now) : null;
    const L = live?.current;

    // --- Batter ---
    const br = batter.current;
    if (br) {
      if (!fs) {
        batPose(br, mixKey(KEYS.stance, KEYS.backlift, (Math.sin(t * 1.6) + 1) / 2), 0.06);
        br.head.rotation.set(0, 0.5, 0);
      } else if (fs.swing) {
        const s = fs.swing.t;
        const key = s < 0.45 ? mixKey(KEYS.backlift, KEYS.contact, s / 0.45) : mixKey(KEYS.contact, KEYS[fs.swing.shot], (s - 0.45) / 0.55);
        batPose(br, key, 0.12);
        br.head.rotation.set(fs.swing.shot === 'lofted' && s > 0.6 ? -0.4 : 0.1, 0.8, 0);
      } else {
        const wag = L?.phase === 'waiting' || L?.phase === 'intro' ? Math.sin(t * 5) * 0.08 : 0;
        const key = mixKey(KEYS.stance, KEYS.backlift, fs.backlift);
        key.dir[0] += wag;
        batPose(br, key, 0.08 + fs.backlift * 0.05);
        br.head.rotation.set(0.05, 0.75, 0);
      }
      if (fs?.outcome && fs.outcome.runs >= 4 && fs.outcomeMs > 700) {
        // Bat raised high, bouncing on his toes.
        const j = Math.abs(Math.sin(t * 8));
        batPose(br, { hands: [0.05, 1.62 + j * 0.05, 0.12], dir: [0.1, 1, 0.15] }, 0);
        br.root.position.y = j * 0.12;
        br.legL.rotation.set(0, 0, 0.1);
        br.legR.rotation.set(0, 0, -0.1);
        br.shinL.rotation.set(0.1, 0, 0);
        br.shinR.rotation.set(0.1, 0, 0);
        br.head.rotation.set(-0.3, 0.2, 0);
      }
    }

    // --- Bowler ---
    const bw = bowler.current;
    if (bw) {
      const z = fs ? fs.bowlerZ : BOWLER_START_Z;
      bw.root.position.set(BOWLER_RELEASE.x * M, 0, -z * M);
      if (!fs || L?.phase === 'waiting' || L?.phase === 'intro') {
        standPose(bw, t);
        bw.armR.rotation.set(-0.8, 0, 0.2); // polishing the ball on his kameez
      } else if (fs.bowlAction >= 0) bowlPose(bw, fs.bowlAction);
      else runPose(bw, fs.runCycle);
      if (fs?.outcome?.wicket && fs.outcomeMs > 300) cheerPose(bw, t);
    }

    // --- Fielders and fans ---
    FIELDERS.forEach((f, i) => {
      const r = fielderRigs.current[i];
      if (!r) return;
      r.root.rotation.z = 0;
      const catching =
        fs?.outcome?.path === 'skier' && ((i === 0 && fs.outcome.direction >= 0) || (i === 1 && fs.outcome.direction < 0));
      if (catching && fs) {
        const dt = clamp01((fs.outcomeMs - 900) / 500);
        if (dt > 0 && dt < 1) divePose(r, dt, i === 0 ? -1 : 1);
        else if (dt >= 1) cheerPose(r, t);
        else readyPose(r, t);
      } else if (fs?.outcome?.wicket && fs.outcomeMs > 400) cheerPose(r, t + i);
      else if (L?.phase === 'runup' || L?.phase === 'flight') readyPose(r, t);
      else if (i % 2) akimboPose(r, t + i * 2);
      else standPose(r, t + i * 2);
    });
    fanRigs.current.forEach((r, i) => {
      if (!r) return;
      const sp = SPECTATORS[i];
      const big = !!fs?.outcome && (fs.outcome.runs >= 4 || !!fs.outcome.wicket) && fs.outcomeMs > 200;
      spectatorPose(r, sp, t + i * 1.7, big && sp.pose !== 'sit' && sp.pose !== 'lean');
      if (big && (sp.pose === 'sit' || sp.pose === 'lean')) {
        // Seated neighbours throw their arms up without standing.
        r.armL.rotation.set(0, 0, -2.5 + Math.sin(t * 10 + i) * 0.2);
        r.armR.rotation.set(0, 0, 2.5 - Math.sin(t * 10 + i) * 0.2);
        r.foreL.rotation.set(0, 0, 0);
        r.foreR.rotation.set(0, 0, 0);
      }
    });

    // --- Ball ---
    const g = ball.current;
    if (g) {
      const pos = fs?.ball ?? null;
      g.visible = pos !== null;
      if (pos) {
        v(pos, g.position);
        g.position.y += 0.075;
        g.rotation.x += 0.4;
        g.rotation.z += 0.15;
      }
      const hist = history.current;
      if (pos) hist.unshift(g.position.clone());
      else hist.length = 0;
      if (hist.length > trail.current.length * 2) hist.length = trail.current.length * 2;
      trail.current.forEach((m, i) => {
        const p = hist[(i + 1) * 2];
        m.visible = !!p && !!pos;
        if (p) m.position.copy(p);
      });

      // Dust where the ball pitches.
      if (L && fs && L.phase === 'flight') {
        if (lastBounce.current.t0 !== L.t0) lastBounce.current = { t0: L.t0, did: false, swing: -1 };
        const p = (now - L.t0) / (L.delivery.duration * 1000);
        if (!lastBounce.current.did && p >= L.delivery.bounceAt && pos) {
          lastBounce.current.did = true;
          spawnDust(now, pos.x * M, -pos.z * M);
        }
      }
      if (L?.swing && lastBounce.current.swing !== L.swing.at) {
        lastBounce.current.swing = L.swing.at;
        spawnDust(now, BATTER.x * M + 0.2, -BATTER.z * M);
      }
    }

    // --- Timing ring ---
    const rg = ring.current;
    if (rg) {
      rg.visible = !!fs?.ring;
      if (fs?.ring) {
        v(fs.ring.pos, rg.position);
        rg.position.y += 0.075;
        rg.lookAt(camera.position);
        const s = 1 + (1 - fs.ring.opacity) * 0.8;
        rg.scale.setScalar(s);
        (rg.material as THREE.MeshBasicMaterial).opacity = fs.ring.opacity * 0.9;
      }
    }

    // --- Stumps: cartwheel back and the bails fly when bowled ---
    const k = fs?.knock ?? 0;
    stumps.current.forEach((st, i) => st.rotation.set(-k * (0.9 + i * 0.25), 0, (i - 1) * k * 0.35));
    bails.current.forEach((bl, i) => {
      bl.position.set(-0.05 + i * 0.1 + (i ? 1 : -1) * k * 0.4, 0.72 + Math.sin(k * Math.PI) * 0.6, k * 0.9);
      bl.rotation.set(k * 6 * (i ? 1 : -1), 0, Math.PI / 2 + k * 4);
    });

    // --- Window smash flash ---
    if (flash.current) {
      flash.current.visible = !!fs?.crash;
      if (fs?.crash) {
        v(fs.crash, flash.current.position);
        const pulse = 0.5 + ((now / 80) % 1) * 0.6;
        flash.current.scale.setScalar(pulse);
      }
    }

    // --- Dust puffs ---
    dust.current.forEach((m, i) => {
      const d = dustState.current[i];
      const age = d ? (now - d.t0) / 650 : 2;
      m.visible = age < 1;
      if (age < 1 && d) {
        m.position.set(d.x, 0.1 + age * 0.35, d.z);
        m.scale.setScalar(0.06 + age * 0.28);
        (m.material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - age);
      }
    });

    // --- Camera ---
    const target = camPos.current;
    const look = camLook.current;
    if (!fs) {
      // Menu showcase: slow orbit around the batter at a low, heroic angle.
      const a = 1.15 + Math.sin(t * 0.25) * 0.3;
      target.set(-0.5 + Math.sin(a) * 2.6, 0.6, -1.5 + Math.cos(a) * 2.6);
      look.set(-0.6, 1.5, -2.4);
    } else if (fs.heroCam && fs.outcomeMs > 120) {
      // Low reaction shot from in front of the batter, like a film still.
      target.set(3.0, 0.55, -0.2);
      look.set(-0.6, 1.6, -2.0);
    } else {
      target.set(0.9, 2.0, 3.6);
      look.set(-1.4, 0.9, -10);
    }
    // Frame-rate independent easing (settles in ~0.4 s at any fps).
    const ease = fs ? 1 - Math.exp(-Math.min(delta, 0.5) * 9) : 1;
    camera.position.lerp(target, ease);
    const cur = (camera.userData.look as THREE.Vector3 | undefined) ?? look.clone();
    cur.lerp(look, ease);
    camera.userData.look = cur;
    camera.lookAt(cur);
  });

  const dustMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D9BE96', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false }), []);

  return (
    <group>
      <World city={city} />
      <Life city={city} />

      <Chibi
        outfit={{ ...batterOutfit, headwear: batterOutfit.headwear === 'topi' ? 'none' : batterOutfit.headwear }}
        rig={batter}
        batter
        headband
        position={[BATTER.x * M, 0, -BATTER.z * M]}
        rotationY={Math.PI / 2}
      />
      <Chibi outfit={bowlerOutfit} rig={bowler} position={[BOWLER_RELEASE.x * M, 0, -BOWLER_START_Z * M]} />
      {FIELDERS.map((f, i) => {
        const x = f.x * M;
        const z = -f.z * M;
        const face = Math.atan2(BATTER.x * M - x, -BATTER.z * M - z);
        return (
          <Chibi
            key={i}
            outfit={extras.fielders[i]}
            rig={{
              get current() {
                return fielderRigs.current[i] ?? null;
              },
              set current(r: Rig | null) {
                fielderRigs.current[i] = r;
              },
            }}
            position={[x, 0, z]}
            rotationY={face}
          />
        );
      })}
      {SPECTATORS.map((sp, i) => (
        <Chibi
          key={i}
          outfit={extras.fans[i]}
          rig={{
            get current() {
              return fanRigs.current[i] ?? null;
            },
            set current(r: Rig | null) {
              fanRigs.current[i] = r;
            },
          }}
          position={sp.pos}
          rotationY={sp.rotY}
        />
      ))}

      <group ref={crate} visible={!!live} position={[0.05, 0, -STUMPS_Z * M]}>
        <mesh geometry={stumpsGeo.base} material={woodMat} castShadow />
        {[-0.1, 0, 0.1].map((x, i) => (
          <group
            key={x}
            position={[x, 0.05, 0]}
            ref={(el) => {
              if (el) stumps.current[i] = el;
            }}
          >
            <mesh geometry={stumpsGeo.stump} material={woodMat} castShadow />
          </group>
        ))}
        {[0, 1].map((i) => (
          <mesh
            key={i}
            ref={(el) => {
              if (el) bails.current[i] = el;
            }}
          >
            <cylinderGeometry args={[0.012, 0.012, 0.11, 8]} />
            <meshStandardMaterial color="#E9D2A6" roughness={0.55} />
          </mesh>
        ))}
      </group>

      {/* Tape ball */}
      <group ref={ball} visible={false}>
        <mesh castShadow>
          <sphereGeometry args={[0.075, 20, 14]} />
          <meshStandardMaterial color="#F1E7CF" roughness={0.6} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0.4]}>
          <torusGeometry args={[0.075, 0.018, 8, 24]} />
          <meshStandardMaterial color="#D62828" roughness={0.4} />
        </mesh>
      </group>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          visible={false}
          ref={(m) => {
            if (m) trail.current[i] = m;
          }}
        >
          <sphereGeometry args={[0.065 - i * 0.009, 10, 8]} />
          <meshBasicMaterial color="#FFF3C4" transparent opacity={0.45 - i * 0.08} depthWrite={false} />
        </mesh>
      ))}

      <mesh ref={ring} visible={false} renderOrder={10}>
        <torusGeometry args={[0.28, 0.03, 8, 40]} />
        <meshBasicMaterial color="#FFE066" transparent opacity={0.8} depthWrite={false} depthTest={false} />
      </mesh>

      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[0.6, 12, 10]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.7} />
      </mesh>

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          visible={false}
          material={dustMat.clone()}
          ref={(m) => {
            if (m) dust.current[i] = m;
          }}
        >
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

const BUILD_SCALE = { kid: 0.78, teen: 0.95, uncle: 1.02 } as const;

function spectatorPose(r: Rig, sp: Spectator, t: number, excited: boolean) {
  if (excited) return cheerPose(r, t);
  switch (sp.pose) {
    case 'sit':
      // Seat height is in metres; the rig works in unscaled body units.
      return sitPose(r, t, (sp.seat ?? 0.4) / BUILD_SCALE[sp.build] + 0.07);
    case 'clap':
      return clapPose(r, t * 0.35);
    case 'akimbo':
      return akimboPose(r, t);
    case 'lean':
      standPose(r, t, 0.4);
      r.body.rotation.x = 0.3;
      r.armL.rotation.set(-1.0, 0, -0.1);
      r.armR.rotation.set(-1.0, 0, 0.1);
      r.foreL.rotation.set(-0.9, 0, 0);
      r.foreR.rotation.set(-0.9, 0, 0);
      return;
    default:
      return standPose(r, t);
  }
}
