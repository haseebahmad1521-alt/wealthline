// Projects: the ascent (owner, Nov 2, 2026). A generic low-poly rocket climbing away from Earth, drawn in the planet
// scene (no second WebGL context). It hangs in camera space in the bottom-right third, so it barely moves while the
// planet and stars drift behind it; the sense of speed comes from the plume, the smoke, a few motion lines and the odd
// cloud sweeping past. No logos, flags or names. Presentation only: none of this is data.
import * as THREE from 'three';

// Rocket units: nozzle exit at y = 0, nose at y = 1 (scaled to the screen each frame).
const R = 0.045;
const WHITE = 0xf2f4f7;
const DARK = 0x1c2027;
const METAL = 0x4a4f58;

/** A soft round sprite: noisy, layered blobs for smoke and cloud, or a clean radial glow for the nozzle bloom. */
function spriteTexture(kind: 'puff' | 'glow') {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  if (kind === 'glow') {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,236,200,0.75)');
    g.addColorStop(0.45, 'rgba(255,170,90,0.22)');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  } else {
    // Fixed seed: the same fluffy shape every visit.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * s * 0.22;
      const x = s / 2 + Math.cos(a) * d;
      const y = s / 2 + Math.sin(a) * d;
      const r = s * (0.12 + rnd() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Smooth shading round the hull; hard edges only where parts meet (stage seams, the base, fins, legs), because each
// part is its own mesh and the boxes keep their crisp corners (owner, Nov 2, 2026).
// Drawn in the transparent pass (fully opaque, still writing depth) after the atmosphere's additive shell: the camera
// skims just above that shell, and drawn before it the shell's edge cut a hard line through the hull (owner, Nov 2).
// The haze the rocket sits in comes from its emissive instead (see `update`).
function buildBody() {
  const body = new THREE.Group();
  const hullMat = { transparent: true, opacity: 1, depthWrite: true };
  const white = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.42, metalness: 0.05, ...hullMat });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6, metalness: 0.15, ...hullMat });
  const metal = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide, ...hullMat });
  const seg = 40;
  const cyl = (y0: number, y1: number, m: THREE.Material, r0 = R, r1 = R) => {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, true);
    g.translate(0, (y0 + y1) / 2, 0);
    body.add(new THREE.Mesh(g, m));
  };
  cyl(0.035, 0.62, white); // first stage
  cyl(0.62, 0.69, dark); // interstage
  cyl(0.69, 0.84, white); // second stage
  // Fairing: an ogive lathed from a short profile.
  const ogive: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    ogive.push(new THREE.Vector2(R * 1.06 * Math.sqrt(1 - t * t * 0.98), 0.84 + t * 0.16));
  }
  body.add(new THREE.Mesh(new THREE.LatheGeometry(ogive, seg), white));
  // Base plate and engine bell.
  const plate = new THREE.CircleGeometry(R, seg);
  plate.rotateX(Math.PI / 2);
  plate.translate(0, 0.035, 0);
  body.add(new THREE.Mesh(plate, dark));
  cyl(0, 0.035, metal, R * 0.62, R * 0.38);
  // Grid fins (folded flat under the interstage) and landing legs (folded along the first stage), four of each.
  const fin = new THREE.BoxGeometry(R * 0.9, R * 0.75, R * 0.08);
  const leg = new THREE.BoxGeometry(R * 0.32, 0.2, R * 0.16);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const f = new THREE.Mesh(fin, dark);
    f.position.set(Math.sin(a) * R * 1.05, 0.585, Math.cos(a) * R * 1.05);
    f.rotation.y = a;
    body.add(f);
    const l = new THREE.Mesh(leg, dark);
    l.position.set(Math.sin(a + Math.PI / 4) * R * 1.04, 0.14, Math.cos(a + Math.PI / 4) * R * 1.04);
    l.rotation.y = a + Math.PI / 4;
    body.add(l);
  }
  // After the atmosphere (0), before the smoke (1) and the flame (2).
  body.traverse((o) => (o.renderOrder = 0.5));
  return { body, mats: [white, dark, metal] };
}

// The plume: an open cone, additive, hot white at the nozzle cooling to orange, soft at its edges, with a little flicker.
const plumeVertex = /* glsl */ `
  varying float vT;
  varying float vRim;
  void main() {
    vT = uv.y; // 1 at the nozzle, 0 at the tail
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vRim = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const plumeFragment = /* glsl */ `
  uniform float time;
  uniform float strength;
  uniform vec3 hot;
  uniform vec3 cool;
  varying float vT;
  varying float vRim;
  void main() {
    float flicker = 0.88 + 0.12 * sin(time * 47.0 + vT * 9.0) * sin(time * 31.0);
    float along = pow(vT, 1.6);
    vec3 c = mix(cool, hot, smoothstep(0.55, 1.0, vT));
    float a = along * pow(vRim, 1.8) * strength * flicker;
    gl_FragColor = vec4(c * a, a);
  }
`;

// Smoke and cloud billboards: one instanced quad, per-instance alpha, normal blending.
const puffVertex = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vAlpha = aAlpha;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const puffFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 tint;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(tint, t.a * vAlpha);
  }
`;
// Motion lines: streaks brightest in the middle, faded at both ends; each has its own width and strength.
const lineFragment = /* glsl */ `
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    float a = sin(vUv.x * 3.14159) * (1.0 - abs(vUv.y * 2.0 - 1.0)) * vAlpha;
    gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a, a);
  }
`;

const SMOKE = 96;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const SUN_HIGH = new THREE.Color(0xfff4e6);
const SUN_LOW = new THREE.Color(0xffa565);
const AIR = new THREE.Color(0x9cc4ff);
const SPACE = new THREE.Color(0x141a26);
const GROUND = new THREE.Color(0x3a4a5e);
const NIGHT = new THREE.Color(0x0a0d14);
const veil = new THREE.Color();
const SMOKE_DAY = new THREE.Color(0.94, 0.95, 0.97);
const SMOKE_NIGHT = new THREE.Color(0.32, 0.36, 0.44);
const LINES = 6;

/** mu: cosine of the sun's height over the ground below (−1 … 1); alt: 0 low … 1 at the top of the climb. */
export type RocketLight = { mu: number; alt: number };

export type Rocket = {
  /** Add to the camera: everything lives in camera space. */
  group: THREE.Group;
  /** mix: 0 hidden … 1 in place (eased by the caller). reduce: still rocket with a steady plume, nothing else moves. */
  update(dt: number, now: number, mix: number, aspect: number, fovDeg: number, sunDirView: THREE.Vector3, reduce: boolean, light: RocketLight): void;
  dispose(): void;
};

export function createRocket(): Rocket {
  const group = new THREE.Group();
  group.visible = false;
  // Lights only touch the rocket's standard materials (the planet is all shader materials).
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 2.4);
  const fill = new THREE.HemisphereLight(0x9cc4ff, 0x1a2230, 0.7);
  group.add(sunLight, sunLight.target, fill);

  // The rocket's frame: `craft` takes the screen placement and lean; `body` the slow wobble.
  const craft = new THREE.Group();
  const { body, mats } = buildBody();
  craft.add(body);
  group.add(craft);

  const hull = new THREE.PointLight(0xffa860, 0, 0, 0); // engine glow on the hull; no falloff at this tiny scale
  hull.position.set(0, -0.05, R * 2.5);
  body.add(hull);

  const plumeUniforms = { time: { value: 0 }, strength: { value: 1 }, hot: { value: new THREE.Color(1, 0.97, 0.9) }, cool: { value: new THREE.Color(1, 0.5, 0.16) } };
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: plumeUniforms,
    vertexShader: plumeVertex,
    fragmentShader: plumeFragment,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const plumeGeo = (radius: number, length: number) => {
    // Cone with its tip down: uv.y runs 1 at the wide nozzle end … 0 at the tail.
    const g = new THREE.CylinderGeometry(radius, radius * 0.25, length, 20, 6, true);
    g.translate(0, -length / 2, 0);
    return g;
  };
  const plumeOuter = new THREE.Mesh(plumeGeo(R * 0.85, 0.5), plumeMat);
  const plumeCore = new THREE.Mesh(plumeGeo(R * 0.45, 0.2), plumeMat);
  // Flame after the smoke, so the smoke reads as pouring out from behind the fire.
  plumeOuter.renderOrder = plumeCore.renderOrder = 2;
  body.add(plumeOuter, plumeCore);

  const glowTex = spriteTexture('glow');
  const bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  bloom.scale.setScalar(0.34);
  bloom.position.y = -0.01;
  bloom.renderOrder = 2;
  body.add(bloom);

  // Smoke: spawned at the nozzle in camera space, left behind (down and to the right), growing and fading.
  const puffTex = spriteTexture('puff');
  const quad = new THREE.PlaneGeometry(1, 1);
  const makePuffs = (count: number, fragment: string, blending: THREE.Blending, tint: THREE.Color) => {
    const geo = quad.clone();
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', alpha);
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { map: { value: puffTex }, tint: { value: tint } },
        vertexShader: puffVertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending,
      }),
      count,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    return { mesh, alpha };
  };
  const smokeTint = new THREE.Color(0.94, 0.95, 0.97);
  const smoke = makePuffs(SMOKE, puffFragment, THREE.NormalBlending, smokeTint);
  const lines = makePuffs(LINES, lineFragment, THREE.AdditiveBlending, new THREE.Color(1, 1, 1));
  const cloud = makePuffs(1, puffFragment, THREE.NormalBlending, new THREE.Color(1, 1, 1));
  smoke.mesh.renderOrder = 1; // over the planet, under the flame
  group.add(smoke.mesh, lines.mesh, cloud.mesh);

  const puffs = Array.from({ length: SMOKE }, () => ({ age: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, size: 0 }));
  const streaks = Array.from({ length: LINES }, () => ({ age: 1, life: 1, x: 0, y: 0, len: 0, width: 0, strength: 0 }));
  let spawn = 0;
  let streakAt = 0;
  let cloudAt = 6;
  const sweep = { age: 1, life: 0.7, y: 0 };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const nozzle = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const toGroup = new THREE.Matrix4();
  const Z = new THREE.Vector3(0, 0, 1);
  const hide = () => m4.makeScale(0, 0, 0);

  // The rocket sits this far in front of the camera (scene units). Close, because the camera skims the surface: the
  // ground below the rocket is ≥0.15 away. Its size on screen does not depend on this.
  const DEPTH = 0.056;
  const LEAN = -0.55; // radians: nose up and to the right (owner, Nov 2: tilted further right)

  function update(dt: number, now: number, mix: number, aspect: number, fovDeg: number, sunDirView: THREE.Vector3, reduce: boolean, light: RocketLight) {
    group.visible = mix > 0.002;
    if (!group.visible) return;
    const t = now / 1000;
    const hh = DEPTH * Math.tan((fovDeg / 2) * (Math.PI / 180));
    const hw = hh * aspect;
    // Bottom-right third; a little smaller where the screen is narrow, so it never crowds a phone.
    const L = Math.min(hh * 0.62, hw * 0.95);
    const eased = mix * mix * (3 - 2 * mix);
    // Flies in from below-right along its own heading.
    const away = (1 - eased) * L * 1.6;
    // The camera follows the rocket loosely: a slow wander of a few percent of the view so it never sits pinned.
    const wx = reduce ? 0 : hw * (0.05 * Math.sin(t * 0.083) + 0.025 * Math.sin(t * 0.191 + 1.3));
    const wy = reduce ? 0 : hh * (0.04 * Math.sin(t * 0.067 + 2.1) + 0.02 * Math.sin(t * 0.157));
    // Shifted back along its lean so the steeper tilt keeps the nose on screen at phone widths.
    const back = L * 0.45;
    craft.position.set(hw * 0.5 + wx + Math.sin(LEAN) * (away + back), -hh * 0.5 + wy - Math.cos(LEAN) * (away + back * 0.4), -DEPTH);
    craft.rotation.set(0, 0, LEAN);
    craft.scale.setScalar(L);
    // Floaty: two summed sines of yaw and roll so the hull turns in the light (none under reduced motion).
    body.rotation.set(
      reduce ? 0.1 : 0.1 + 0.02 * Math.sin(t * 0.19),
      reduce ? 0.6 : 0.6 + 0.12 * Math.sin(t * 0.11) + 0.04 * Math.sin(t * 0.29),
      reduce ? 0 : 0.03 * Math.sin(t * 0.23 + 1),
    );
    sunLight.position.copy(sunDirView);
    sunLight.target.position.set(0, 0, 0);
    // The light where it flies, from two numbers and a few lerps (no ray marching): sunlight warms and dims toward the
    // terminator and is gone on the night side; the sky fill is blue air low down, nearly black near space; the ground
    // bounce follows day and night; and the air between camera and hull adds a faint blue veil (emissive) that thins as
    // it climbs.
    const day = smooth(-0.08, 0.25, light.mu);
    const low = 1 - smooth(0, 0.3, light.mu); // sun near the horizon
    sunLight.color.copy(SUN_HIGH).lerp(SUN_LOW, low);
    sunLight.intensity = 2.4 * day;
    const air = 1 - light.alt * 0.6;
    fill.color.copy(SPACE).lerp(AIR, air * (0.25 + 0.75 * day));
    fill.groundColor.copy(NIGHT).lerp(GROUND, day);
    fill.intensity = 0.35 + 0.45 * day;
    veil.copy(AIR).multiplyScalar(0.07 * air * (0.3 + 0.7 * day));
    for (const m of mats) m.emissive.copy(veil);
    // Smoke is lit by the same sun: white by day, a dim blue-grey at night (the flame still lights it near the nozzle).
    smokeTint.copy(SMOKE_NIGHT).lerp(SMOKE_DAY, 0.2 + 0.8 * day);

    const flicker = reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 23);
    plumeUniforms.time.value = reduce ? 0 : t;
    plumeUniforms.strength.value = eased * 1.7;
    hull.intensity = 1.4 * eased * flicker;
    bloom.material.opacity = eased * (0.85 + 0.15 * flicker);
    plumeOuter.scale.set(1, reduce ? 1 : 0.94 + 0.08 * flicker, 1);

    body.updateWorldMatrix(true, false);
    nozzle.set(0, -0.02, 0).applyMatrix4(body.matrixWorld);
    group.worldToLocal(nozzle);
    // The exhaust direction in the group's (camera's) frame, where the smoke and lines live.
    axis.set(0, -1, 0).transformDirection(body.matrixWorld).transformDirection(toGroup.copy(group.matrixWorld).invert());
    // Its direction on screen; the motion lines streak along it, the same angle as the rocket.
    const flat = Math.hypot(axis.x, axis.y) || 1;
    const dirX = axis.x / flat;
    const dirY = axis.y / flat;

    // Smoke.
    const motion = !reduce;
    if (motion) {
      spawn += dt * 26 * eased;
      for (const s of puffs) {
        if (spawn < 1) break;
        if (s.age < s.life) continue;
        spawn -= 1;
        // Born at the nozzle exit and shot straight back along the exhaust, spreading a little to either side.
        const spread = (Math.random() - 0.5) * 0.22;
        const speed = L * (1.9 + Math.random() * 0.8);
        s.age = 0;
        s.life = 1.8 + Math.random() * 1.2;
        s.x = nozzle.x + axis.x * L * 0.02;
        s.y = nozzle.y + axis.y * L * 0.02;
        s.z = nozzle.z + axis.z * L * 0.02;
        s.vx = (dirX - dirY * spread) * speed;
        s.vy = (dirY + dirX * spread) * speed;
        s.size = L * (0.1 + Math.random() * 0.08);
      }
      spawn = Math.min(spawn, 2);
    }
    for (let i = 0; i < SMOKE; i++) {
      const s = puffs[i];
      if (motion) s.age += dt;
      const k = s.age / s.life;
      if (!motion || k >= 1) {
        smoke.mesh.setMatrixAt(i, hide());
        smoke.alpha.setX(i, 0);
        continue;
      }
      const drag = Math.exp(-dt * 1.1);
      s.vx *= drag;
      s.vy *= drag;
      // Once the burst slows, the trail keeps sliding back along the exhaust (the rocket outruns it).
      const vx = s.vx + dirX * L * 0.4;
      const vy = s.vy + dirY * L * 0.4;
      s.x += vx * dt;
      s.y += vy * dt;
      const size = s.size * (1 + k * 3.5);
      // Stretched along its motion while fast, rounding out as it slows (owner, Nov 2).
      const stretch = 1 + Math.min(1.2, Math.hypot(vx, vy) / (L * 2.2));
      q.setFromAxisAngle(Z, Math.atan2(vy, vx));
      smoke.mesh.setMatrixAt(i, m4.compose(pos.set(s.x, s.y, s.z), q, scl.set(size * stretch, size, 1)));
      // Thin inside the flame, thickest just past its tip, then a long fade out.
      smoke.alpha.setX(i, Math.min(k * 6, 1) * (1 - k) * (1 - k) * 0.95 * eased);
    }
    smoke.mesh.instanceMatrix.needsUpdate = true;
    smoke.alpha.needsUpdate = true;

    // Motion lines: 3–6 thin streaks whooshing past along the rocket's own angle, nose end to tail end.
    if (motion && now / 1000 > streakAt) {
      const free = streaks.find((s) => s.age >= s.life);
      if (free) {
        free.age = 0;
        free.life = 0.28 + Math.random() * 0.22;
        // Anywhere across the view, started upstream so each one crosses the screen.
        const across = (Math.random() * 2 - 1) * Math.hypot(hw, hh);
        free.x = -dirY * across - dirX * hh * 1.1;
        free.y = dirX * across - dirY * hh * 1.1;
        // Mixed weights so they read as air rushing past, not rain: mostly faint hairlines, now and then a bolder one.
        const bold = Math.random() ** 2.2;
        free.len = hh * (0.35 + Math.random() * 0.8);
        free.width = hh * (0.004 + bold * 0.02);
        free.strength = 0.12 + bold * 0.5 + Math.random() * 0.1;
      }
      streakAt = now / 1000 + 0.1 + Math.random() * 0.35;
    }
    const angle = Math.atan2(dirY, dirX);
    for (let i = 0; i < LINES; i++) {
      const s = streaks[i];
      if (motion) s.age += dt;
      const k = s.age / s.life;
      if (!motion || k >= 1) {
        lines.mesh.setMatrixAt(i, hide());
        lines.alpha.setX(i, 0);
        continue;
      }
      const travel = k * hh * 2.4;
      q.setFromAxisAngle(Z, angle);
      lines.mesh.setMatrixAt(
        i,
        m4.compose(pos.set(s.x + dirX * travel, s.y + dirY * travel, -DEPTH * 1.05), q, scl.set(s.len, s.width, 1)),
      );
      lines.alpha.setX(i, Math.sin(k * Math.PI) * s.strength * eased);
    }
    lines.mesh.instanceMatrix.needsUpdate = true;
    lines.alpha.needsUpdate = true;

    // Every 6–12 s a very faint cloud sweeps fast across, in front of the rocket.
    if (motion && t > cloudAt && sweep.age >= sweep.life) {
      sweep.age = 0;
      sweep.y = (Math.random() * 0.8 - 0.7) * hh;
      cloudAt = t + 6 + Math.random() * 6;
    }
    if (motion && sweep.age < sweep.life) {
      sweep.age += dt;
      const k = Math.min(sweep.age / sweep.life, 1);
      const x = hw * (1.8 - k * 3.6);
      const d = DEPTH * 0.7;
      const s = hh * 1.1 * (d / DEPTH);
      cloud.mesh.setMatrixAt(0, m4.compose(pos.set(x * (d / DEPTH), (sweep.y - k * hh * 0.5) * (d / DEPTH), -d), q.identity(), scl.set(s * 1.8, s, 1)));
      cloud.alpha.setX(0, Math.sin(k * Math.PI) * 0.16 * eased);
    } else {
      cloud.mesh.setMatrixAt(0, hide());
      cloud.alpha.setX(0, 0);
    }
    cloud.mesh.instanceMatrix.needsUpdate = true;
    cloud.alpha.needsUpdate = true;
  }

  function dispose() {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | undefined;
      m?.dispose();
    });
    quad.dispose();
    puffTex.dispose();
    glowTex.dispose();
  }

  return { group, update, dispose };
}
