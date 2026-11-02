// The live planet behind every screen (owner's live-planet direction, Nov 1, 2026). three.js on a fixed full-window
// canvas. What is real: the sunlight. Day and night fall where they fall right now (subsolar point from the clock),
// and the stars sit where they are over Earth (sidereal time). What is presentation: the camera's slow drift, the
// spin that scrolling adds, the glow. Reduced motion: one still frame, redrawn each minute as the sun moves.
import { geoEquirectangular, geoPath } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { countryShape, land } from '@/lib/geo';
import { ANGLES, scene as sceneState, zoomFactor } from '@/lib/scene';
import { greenwichSiderealDeg, latLngToUnit, subsolarPoint } from '@/lib/sun';
import { TIERS, maxTier as maxTierFor, nextStep, startTier as startTierFor, type Tier } from '@/lib/texture-tier';
import { color } from '@/theme';
import { createRocket } from './rocket';
import { atmosphereFragment, earthFragment, quadVertex, skyFragment, starFragment, starVertex, sunFragment, worldVertex } from './planet-shaders';

const BASE = process.env.EXPO_PUBLIC_BASE_URL ?? '';
const RAD = Math.PI / 180;
const FOV = 40;

// Camera path, from the top of a page (p = 0) to the bottom (p = 1).
const DIST = [1.62, 1.3] as const; // distance from Earth's centre, in Earth radii: a wide horizon at the top, a little closer at the bottom
// Where the horizon sits on screen (NDC, -1 bottom … 1 top). Top of the page: just Earth's tip, clear of the phone tab
// bar. Bottom: the horizon near the top edge, so Earth fills most of the view from the bottom up.
const LIMB_Y = [-0.6, 0.7] as const;
const ROLL = [0, -9] as const; // degrees: the horizon tilts steeper on the way down
const HAZE = [0.0, 1.3] as const;
// Projects rides a rocket at the edge of space (owner, Nov 2, 2026): the camera skims the atmosphere looking along the
// surface, which stretches back to a near-flat horizon below the middle of the view; the sky above is bright blue air
// that thins to faint stars at the top. Scrolling climbs a little. Distance (Earth radii), horizon (NDC), haze, and
// `air`: how much sky glow the camera sees from inside the atmosphere. The planet turns very slowly (SPIN, °/s).
// Owner, Nov 2: 25% back toward the earlier, higher pose (1.18–1.28, horizon 0.04/−0.12, no air): skimming lower read
// as grey overcast; from here the haze blends into the surface.
const ROCKET = { dist: [1.066, 1.104], limbY: [-0.155, -0.255], haze: 0.75, air: 0.75, spin: 0.06 } as const;
// Where the camera hangs comes from the page in view (ANGLES in scene.ts); switching pages eases from one angle to the next.
const DRIFT_DEG = 22; // gentle orbit: ±22° over DRIFT_PERIOD
const DRIFT_PERIOD_S = 360;

// A visit (a profile): the place sits in the upper part of the view, close enough to read its coastline, under the
// glass page.
const VISIT = { zoom: 0.62, centerX: 0.5, centerY: 0.3 } as const;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Ocean = white, land = black, drawn from the same Natural Earth shapes the World view uses. */
function oceanMask() {
  const w = 2048;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const path = geoPath(geoEquirectangular().fitSize([w, h], { type: 'Sphere' }), ctx);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  path(land);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// World's shaded countries, painted into an equirectangular map the Earth shader blends over the surface. Economies
// tints by strength (more of the tracked revenue against GDP: stronger); What if marks the shocked place in red.
const FILL = { base: [156, 203, 255], risk: [255, 138, 128] } as const;
function paintFills(c: HTMLCanvasElement, fills: typeof sceneState.fills) {
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  const path = geoPath(geoEquirectangular().fitSize([c.width, c.height], { type: 'Sphere' }), ctx);
  for (const f of fills) {
    const shape = countryShape(f.iso2);
    if (!shape) continue;
    const [r, g, b] = f.risk ? FILL.risk : FILL.base;
    ctx.fillStyle = `rgba(${r},${g},${b},${f.risk ? 0.5 : 0.1 + 0.4 * f.strength})`;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    path(shape);
    ctx.fill();
    ctx.stroke();
  }
}

const idle = (fn: () => void) =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 50);

function sunDirection(now: number) {
  const s = subsolarPoint(now);
  return { vec: new THREE.Vector3(...latLngToUnit(s.lat, s.lng)), lng: s.lng };
}

export function PlanetScene() {
  const host = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setState('failed');
      return;
    }
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(color.bg);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 400);

    // Phones get 2K textures; bigger or denser screens 4K.
    const res = TIERS[startTierFor(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1))];
    // ImageBitmapLoader decodes the JPEG off the main thread (an 8K swap used to stall a frame for the decode alone);
    // browsers without createImageBitmap fall back to the plain loader.
    const bitmaps = typeof createImageBitmap === 'function';
    const loader = bitmaps
      ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' })
      : new THREE.TextureLoader();
    const load = (name: string, srgb = true, size: Tier = res) =>
      new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(`${BASE}/planet/${name}-${size}.jpg`, (img: THREE.Texture | ImageBitmap) => {
          const t = img instanceof THREE.Texture ? img : new THREE.Texture(img);
          if (!(img instanceof THREE.Texture)) {
            t.flipY = false; // flipped while decoding
            t.needsUpdate = true;
          }
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          resolve(t);
        }, undefined, reject),
      );

    const sun = sunDirection(Date.now());
    const earthUniforms = {
      dayMap: { value: null as THREE.Texture | null },
      nightMap: { value: null as THREE.Texture | null },
      oceanMap: { value: oceanMask() as THREE.Texture },
      sunDir: { value: sun.vec.clone() },
      nightLift: { value: 0 },
      fillMap: { value: null as THREE.Texture | null },
      fillMix: { value: 0 },
    };
    const fillCanvas = document.createElement('canvas');
    fillCanvas.width = 2048;
    fillCanvas.height = 1024;
    const fillTexture = new THREE.CanvasTexture(fillCanvas);
    fillTexture.colorSpace = THREE.SRGBColorSpace;
    earthUniforms.fillMap.value = fillTexture;
    let fillsVersion = -1;
    // Level of detail: a light sphere normally, a finer one only when the globe is big on screen and a coarse limb
    // would show (the shading is per pixel, so the facet count only matters at the silhouette).
    const sphereLo = new THREE.SphereGeometry(1, 64, 48);
    const sphereHi = new THREE.SphereGeometry(1, 128, 96);
    const earth = new THREE.Mesh(
      sphereLo,
      new THREE.ShaderMaterial({ uniforms: earthUniforms, vertexShader: worldVertex, fragmentShader: earthFragment }),
    );
    // three's sphere puts texture u = 0.5 (0°) on +X; turn it so 0° faces +Z and 90°E faces +X, matching sun.ts.
    earth.rotation.y = -Math.PI / 2;

    const atmoUniforms = {
      sunDir: earthUniforms.sunDir,
      Rp: { value: 1 },
      Ra: { value: 1.055 },
      HR: { value: 0.0076 },
      HM: { value: 0.0021 },
      betaR: { value: new THREE.Vector3(6.2, 14.3, 35.1) },
      betaM: { value: 2.5 },
      sunI: { value: 9 },
      g: { value: 0.76 },
    };
    const atmosphere = new THREE.Mesh(
      sphereLo, // scaled to the shell radius below
      new THREE.ShaderMaterial({
        uniforms: atmoUniforms,
        vertexShader: worldVertex,
        fragmentShader: atmosphereFragment,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );

    const skyUniforms = {
      milkyWay: { value: null as THREE.Texture | null },
      gmst: { value: greenwichSiderealDeg(Date.now()) * RAD },
      haze: { value: HAZE[0] as number },
      glowGain: { value: 3.2 },
      air: { value: 0 },
      sunDir: earthUniforms.sunDir,
    };
    // Stars as points (batch S): one draw call, crisp at any zoom. The geometry arrives with the catalogue below; the
    // Points object rides on the camera like the sky and turns by sidereal time (rotation.y = −GMST puts each star at
    // longitude RA − GMST, matching the sky shader). Drawn after Earth, so the planet hides the stars behind it.
    const starUniforms = {
      haze: skyUniforms.haze,
      air: skyUniforms.air,
      sunDir: earthUniforms.sunDir,
      pxRatio: { value: renderer.getPixelRatio() },
      starGain: { value: 2 },
    };
    const stars = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: starUniforms,
        vertexShader: starVertex,
        fragmentShader: starFragment,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    stars.renderOrder = -0.5; // before the atmosphere's additive glow
    stars.frustumCulled = false; // its bounds would be the empty geometry until the catalogue lands
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16), // per-pixel directions: the sky needs no more facets
      new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: worldVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false }),
    );
    sky.renderOrder = -1;

    const sunQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: sunFragment, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    sunQuad.scale.setScalar(70);

    atmosphere.scale.setScalar(1.055);
    scene.add(sky, stars, earth, atmosphere, sunQuad);
    // Projects' rocket hangs in camera space, so the camera joins the scene graph.
    const rocket = createRocket();
    camera.add(rocket.group);
    scene.add(camera);
    // Development only: lets the browser console inspect the scene.
    if (__DEV__) (window as unknown as { __planet: object }).__planet = { renderer, scene, camera, earth, sky, atmosphere, sunQuad, state: sceneState };

    let disposed = false;

    // Texture detail adapts to the device (owner, Nov 2, 2026). First paint uses the tier above; once the scene holds a
    // smooth frame rate, the next tier loads in the background and swaps in, and a sustained slowdown swaps back (and
    // stops trying). 8K only where the GPU takes it, the screen is big and memory isn't tight; Save-Data and slow
    // connections never upgrade. The service worker caches whatever loads (public/planet, CacheFirst).
    const startTier = TIERS.indexOf(res);
    let tier = startTier;
    const loaded: ({ day: THREE.Texture; night: THREE.Texture } | undefined)[] = [];
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
    const maxTier = maxTierFor({
      start: startTier,
      maxTexture: renderer.capabilities.maxTextureSize,
      phone,
      deviceMemory: nav.deviceMemory,
      saveData: nav.connection?.saveData,
      effectiveType: nav.connection?.effectiveType,
    });
    let readyAt = 0;
    let frameMs = 16.7; // smoothed frame time
    let lastRaw = 0;
    let checkAt = 0;
    let busy = false;
    let settled = false; // a drop back ends upgrades for this visit

    function swapTo(next: number) {
      const t = loaded[next];
      if (!t) return;
      earthUniforms.dayMap.value = t.day;
      earthUniforms.nightMap.value = t.night;
      tier = next;
    }
    function adapt(now: number) {
      if (now - lastRaw < 250) frameMs = frameMs * 0.95 + (now - lastRaw) * 0.05;
      lastRaw = now;
      if (__DEV__) Object.assign((window as unknown as { __planet: object }).__planet, { lod: { tier: TIERS[tier], maxTier: TIERS[maxTier], frameMs, readyAt, busy, settled } });
      if (!readyAt || busy || now < checkAt || now - readyAt < 3000) return;
      checkAt = now + 2000;
      const step = nextStep({ frameMs, tier, start: startTier, max: maxTier, settled });
      if (step === 'down') {
        // Too slow since the upgrade: back down, free the big textures, and stay there.
        const big = loaded[tier];
        swapTo(tier - 1);
        loaded[tier + 1] = undefined;
        for (const t of [big?.day, big?.night]) {
          t?.dispose();
          (t?.image as ImageBitmap | undefined)?.close?.(); // a decoded bitmap holds its pixels until closed
        }
        settled = true;
      } else if (step === 'up') {
        busy = true;
        const next = tier + 1;
        Promise.all([load('day', true, TIERS[next]), load('night', true, TIERS[next])])
          .then(([day, night]) => {
            if (disposed) return void (day.dispose(), night.dispose());
            loaded[next] = { day, night };
            swapTo(next);
            // The upload hitches a frame or two: measure afresh before judging the new tier.
            frameMs = 16.7;
            checkAt = performance.now() + 3000;
          })
          .catch(() => (settled = true))
          .finally(() => (busy = false));
      }
    }

    // The star catalogue (scripts/build-stars.mjs): Int16 quadruples of RA, Dec, V × 1000, B−V × 1000.
    fetch(`${BASE}/planet/stars.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        if (disposed) return;
        const q = new Int16Array(buf);
        const n = q.length / 4;
        const pos = new Float32Array(n * 3);
        const mag = new Float32Array(n);
        const bv = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const ra = (q[i * 4] / 32767) * 2 * Math.PI;
          const dec = (q[i * 4 + 1] / 32767) * (Math.PI / 2);
          // Radius 150: inside the sky sphere (200) and the far plane (400).
          pos[i * 3] = 150 * Math.cos(dec) * Math.sin(ra);
          pos[i * 3 + 1] = 150 * Math.sin(dec);
          pos[i * 3 + 2] = 150 * Math.cos(dec) * Math.cos(ra);
          mag[i] = q[i * 4 + 2] / 1000;
          bv[i] = q[i * 4 + 3] / 1000;
        }
        stars.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        stars.geometry.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
        stars.geometry.setAttribute('bv', new THREE.BufferAttribute(bv, 1));
        invalidate();
      })
      .catch(() => {}); // no stars is a quieter sky, not a failure

    // The Milky Way is a 2K glow with the point stars filtered out (they are drawn as points above).
    Promise.all([load('day'), load('night'), load('milkyway', true, '2k')])
      .then(([day, night, milkyWay]) => {
        if (disposed) return;
        earthUniforms.dayMap.value = day;
        earthUniforms.nightMap.value = night;
        loaded[tier] = { day, night };
        readyAt = performance.now();
        // The glow wraps at RA 0h; without mipmaps there's no seam line where the texture's edges meet.
        milkyWay.generateMipmaps = false;
        milkyWay.minFilter = THREE.LinearFilter;
        skyUniforms.milkyWay.value = milkyWay;
        setState('ready');
        invalidate();
        // Compile the rocket's shaders in idle time (with its lights, so the programs match), in parallel where the
        // browser supports it: first opening Projects used to stall ≈100 ms on a mid phone compiling them.
        const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        (idle ?? ((cb: () => void) => setTimeout(cb, 1500)))(
          () => {
            if (disposed || rocket.group.visible) return;
            rocket.group.visible = true;
            void renderer.compileAsync(scene, camera).catch(() => undefined);
            rocket.group.visible = false; // compileAsync gathers the materials synchronously
          },
          { timeout: 4000 },
        );
      })
      .catch(() => !disposed && setState('failed'));

    const viewport = { w: window.innerWidth, h: window.innerHeight };
    // Declared before anything below can request a frame (resize runs immediately).
    let raf = 0;
    let still: ReturnType<typeof setInterval> | undefined;

    // Sun glow: a soft warm light from the sun's side of the view. On screen it blooms around the sun itself; off
    // screen it slides along the edge nearest the sun. Behind the UI, so the glass still dims it under text.
    const glow = document.createElement('div');
    glow.setAttribute('aria-hidden', 'true');
    glow.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:none;border-radius:50%;mix-blend-mode:screen;will-change:transform,opacity;' +
      'background:radial-gradient(circle,rgba(255,214,170,.55) 0%,rgba(255,184,124,.22) 20%,rgba(255,160,100,.08) 42%,rgba(255,150,90,0) 68%)';
    el.appendChild(glow);

    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      viewport.w = w;
      viewport.h = h;
      sceneState.invalidate?.();
    };
    resize();
    window.addEventListener('resize', resize);

    // Camera state, eased toward what the page asks for.
    let p = sceneState.progress;
    const angle = { ...ANGLES[sceneState.angle] };
    let spin = 0;
    let lastT = performance.now();
    let sunAt = 0;
    const up = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const target = new THREE.Vector3();
    // Two poses, blended: the scroll-driven orbit view and the World view straight at the globe.
    const orbitRig = new THREE.PerspectiveCamera();
    const worldRig = new THREE.PerspectiveCamera();
    const visitRig = new THREE.PerspectiveCamera();
    let worldMix = sceneState.preset === 'world' ? 1 : 0;
    let visitMix = sceneState.visit ? 1 : 0;
    let rocketMix = 0;
    let rocketSpin = 0;
    const rocketLight = { mu: 1, alt: 0 };
    const sunView = new THREE.Vector3();
    let visitAt = { lat: 0, lng: 0 }; // the last place visited: flying back out keeps aiming at it
    const easeTo = (v: number, goal: number, dt: number, rate: number) => {
      const next = reduce ? goal : v + (goal - v) * (1 - Math.exp(-dt * rate));
      return Math.abs(goal - next) < 1e-3 ? goal : next;
    };
    const dir = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const look = new THREE.Vector3();
    const f0v = new THREE.Vector3();
    const posV = new THREE.Vector3();
    const upP = new THREE.Vector3();
    const Y_UP = new THREE.Vector3(0, 1, 0);

    sceneState.project = (lat, lng) => {
      tmp.set(...latLngToUnit(lat, lng));
      toCam.copy(camera.position).sub(tmp).normalize();
      const facing = tmp.dot(toCam);
      tmp.project(camera);
      return { x: ((tmp.x + 1) / 2) * viewport.w, y: ((1 - tmp.y) / 2) * viewport.h, facing };
    };

    function place(now: number, dt: number) {
      if (now - sunAt > 30_000) {
        // The sun moves 0.25° a minute: refresh its direction and the stars every 30 s.
        const s = sunDirection(Date.now());
        earthUniforms.sunDir.value.copy(s.vec);
        sun.lng = s.lng;
        skyUniforms.gmst.value = greenwichSiderealDeg(Date.now()) * RAD;
        sunAt = now;
      }
      const goal = reduce ? 0.35 : sceneState.progress;
      p = reduce ? goal : p + (goal - p) * (1 - Math.exp(-dt * 6));
      if (!reduce) {
        // Scrolling spins the view a little; the spin eases back over ~20 s.
        spin += sceneState.velocity * dt * 12; // a quick flick of two screens a second turns the view ~24°/s
        spin *= Math.exp(-dt / 20);
        sceneState.velocity *= Math.exp(-dt * 4);
        if (!Number.isFinite(spin) || !Number.isFinite(sceneState.velocity)) spin = sceneState.velocity = 0;
      }
      // Linear: Earth rises steadily through the whole list (a slow-in curve would stall it over the first screens).
      const e = p;
      // Projects rides a rocket (batch P): there scrolling climbs a little higher instead of descending, the usual drift
      // and scroll spin fade out, and the planet turns slowly and steadily underneath.
      rocketMix = easeTo(rocketMix, sceneState.angle === 'projects' && sceneState.preset !== 'world' && !sceneState.visit ? 1 : 0, dt, 1.6);
      const rk = rocketMix * rocketMix * (3 - 2 * rocketMix);
      const ts = now / 1000;
      if (!reduce) rocketSpin = (rocketSpin + dt * ROCKET.spin * rk) % 360;
      const d = mix(mix(DIST[0], DIST[1], e), mix(ROCKET.dist[0], ROCKET.dist[1], e), rk);
      const drift = (reduce ? 0 : DRIFT_DEG * Math.sin((ts * 2 * Math.PI) / DRIFT_PERIOD_S)) * (1 - rk) + rocketSpin;
      // Ease toward the page's angle (the shorter way round in longitude).
      const goalAngle = ANGLES[sceneState.angle];
      const ka = reduce ? 1 : 1 - Math.exp(-dt * 1.8);
      angle.lat += (goalAngle.lat - angle.lat) * ka;
      angle.east += ((((goalAngle.east - angle.east + 180) % 360) + 360) % 360 - 180) * ka;
      angle.roll += (goalAngle.roll - angle.roll) * ka;
      const lng = sun.lng + angle.east + drift + spin * (1 - rk);
      if (__DEV__) Object.assign((window as unknown as { __planet: object }).__planet, { dbg: { lng, sunLng: sun.lng, drift, spin, p, dt, vel: sceneState.velocity } });
      const lat = angle.lat;
      const pos = posV.set(...latLngToUnit(lat, lng)).multiplyScalar(d);

      // Look from the camera toward Earth's centre, then pitch up so the horizon lands at LIMB_Y on screen.
      const alpha = Math.asin(1 / d);
      const theta = alpha - Math.atan(mix(mix(LIMB_Y[0], LIMB_Y[1], e), mix(ROCKET.limbY[0], ROCKET.limbY[1], e), rk) * Math.tan((FOV / 2) * RAD));
      const f0 = f0v.copy(pos).negate().normalize();
      right.crossVectors(f0, Y_UP).normalize();
      up.crossVectors(right, f0).normalize();
      fwd.copy(f0).multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta));
      const upPitched = upP.copy(up).multiplyScalar(Math.cos(theta)).addScaledVector(f0, -Math.sin(theta));
      orbitRig.position.copy(pos);
      orbitRig.up.copy(upPitched);
      orbitRig.lookAt(target.copy(pos).add(fwd));
      orbitRig.rotateZ((mix(mix(ROLL[0], ROLL[1], e), 0, rk) + angle.roll) * RAD);

      // World view: straight at the chosen point, far enough that the globe's radius on screen is radiusPx × zoom.
      const w = sceneState.world;
      const tanHalf = Math.tan((FOV / 2) * RAD);
      const aim = (rig: THREE.PerspectiveCamera, lat: number, lng: number, zoom: number, radiusPx: number) => {
        // Never a zero radius (an unmeasured globe area would put the camera at infinity and the whole view at NaN).
        const rNdc = (Math.max(radiusPx, 40) * zoomFactor(zoom)) / (viewport.h / 2);
        const dist = Math.max(1 / Math.sin(Math.atan(Math.min(rNdc, 50) * tanHalf)), 1.06);
        rig.position.set(...latLngToUnit(lat, lng)).multiplyScalar(dist);
        rig.up.set(0, 1, 0);
        rig.lookAt(0, 0, 0);
      };
      aim(worldRig, w.lat, w.lng, w.zoom, w.radiusPx);
      if (sceneState.visit) visitAt = sceneState.visit;
      aim(visitRig, visitAt.lat, visitAt.lng, VISIT.zoom, Math.min(viewport.w, viewport.h) * 0.42);

      worldMix = easeTo(worldMix, sceneState.preset === 'world' ? 1 : 0, dt, 3.2);
      visitMix = easeTo(visitMix, sceneState.visit ? 1 : 0, dt, 2.6);
      const mw = worldMix * worldMix * (3 - 2 * worldMix);
      const v = visitMix * visitMix * (3 - 2 * visitMix);
      // How much of the view is World's: what its overlays (portraits, dots, shading) follow.
      const m = mw * (1 - v);
      sceneState.worldMix = m;
      // Swing around Earth rather than through it: blend the direction and the distance separately. Orbit → World
      // first, then that → the visited place.
      dir.copy(orbitRig.position).normalize().lerp(tmp.copy(worldRig.position).normalize(), mw).normalize();
      const dist = mix(orbitRig.position.length(), worldRig.position.length(), mw);
      camera.quaternion.slerpQuaternions(orbitRig.quaternion, worldRig.quaternion, mw);
      dir.lerp(tmp.copy(visitRig.position).normalize(), v).normalize();
      camera.position.copy(dir).multiplyScalar(mix(dist, visitRig.position.length(), v));
      camera.quaternion.slerp(visitRig.quaternion, v);
      // Off-axis shift so the globe sits in World's globe area (or the visit's spot) instead of mid-screen.
      camera.updateProjectionMatrix();
      camera.projectionMatrix.elements[8] = mix((1 - 2 * w.centerX) * mw, 1 - 2 * VISIT.centerX, v);
      camera.projectionMatrix.elements[9] = -mix((1 - 2 * w.centerY) * mw, 1 - 2 * VISIT.centerY, v);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld();

      skyUniforms.air.value = ROCKET.air * rk * (1 - mw) * (1 - v);
      skyUniforms.haze.value = mix(mix(HAZE[0], HAZE[1], e), ROCKET.haze, rk) * (1 - mw) * (1 - v);
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      stars.rotation.y = -skyUniforms.gmst.value;
      starUniforms.pxRatio.value = renderer.getPixelRatio();
      const sunDir = earthUniforms.sunDir.value;
      sunQuad.position.copy(camera.position).addScaledVector(sunDir, 150);
      sunQuad.quaternion.copy(camera.quaternion);
      placeGlow(sunDir);
      // The light where the rocket is: the sun's height over the ground below it, and how far it has climbed.
      rocketLight.mu = tmp.copy(camera.position).normalize().dot(sunDir);
      rocketLight.alt = e;
      rocket.update(dt, now, rocketMix, camera.aspect, FOV, sunView.copy(sunDir).transformDirection(camera.matrixWorldInverse), reduce, rocketLight);

      // Finer sphere only when Earth's radius on screen passes ~520 px.
      const rPx = ((viewport.h / 2) * Math.tan(Math.asin(Math.min(1 / camera.position.length(), 1)))) / tanHalf;
      const geo = rPx > 520 ? sphereHi : sphereLo;
      if (earth.geometry !== geo) earth.geometry = atmosphere.geometry = geo;
      // Country shading is painted in idle time, never inside a frame (it stalled opening World); the texture swaps
      // in on the next frame after it's ready.
      if (fillsVersion !== sceneState.fillsVersion) {
        const version = (fillsVersion = sceneState.fillsVersion);
        idle(() => {
          if (disposed || version !== sceneState.fillsVersion) return;
          paintFills(fillCanvas, sceneState.fills);
          fillTexture.needsUpdate = true;
          invalidate();
        });
      }
      // Shading belongs to World: it fades with the swing out (a profile on top, another tab).
      earthUniforms.fillMix.value = sceneState.fills.length ? m : 0;
      // Cheap HDR: the closer we look (World zoom, or the bottom of a page), the more the night side opens up.
      earthUniforms.nightLift.value = Math.max(m * w.zoom, v * VISIT.zoom, (1 - mw) * (1 - v) * e * 0.35);
    }

    function placeGlow(sunDir: THREE.Vector3) {
      camera.getWorldDirection(look);
      const cosA = look.dot(sunDir);
      tmp.copy(camera.position).addScaledVector(sunDir, 150).project(camera);
      // A point behind the camera projects mirrored; flip it back to get the side of the view the sun is on.
      let gx = cosA < 0 ? -tmp.x : tmp.x;
      let gy = cosA < 0 ? -tmp.y : tmp.y;
      const onScreen = cosA > 0 && Math.abs(gx) <= 1 && Math.abs(gy) <= 1;
      if (!onScreen) {
        const k = 1 / Math.max(Math.abs(gx), Math.abs(gy), 1e-6);
        gx *= k;
        gy *= k;
      }
      // Stronger the more the view faces the sun; softer when Earth is in front of it (the rim takes over).
      const b = camera.position.dot(sunDir);
      const behindEarth = b < 0 && b * b - (camera.position.lengthSq() - 1) > 0;
      const strength = (0.3 + 0.7 * Math.min(Math.max((cosA + 0.7) / 1.6, 0), 1)) * (onScreen && behindEarth ? 0.5 : 1);
      const size = (onScreen ? 0.9 : 1.25) * Math.max(viewport.w, viewport.h);
      const x = ((gx + 1) / 2) * viewport.w - size / 2;
      const y = ((1 - gy) / 2) * viewport.h - size / 2;
      glow.style.width = glow.style.height = `${size}px`;
      glow.style.transform = `translate3d(${x}px,${y}px,0)`;
      glow.style.opacity = String(0.5 * strength);
    }

    // Draw a frame on demand (dragging or zooming the globe while the loop is paused for reduced motion or loading).
    function invalidate() {
      if (!raf && !disposed && earthUniforms.dayMap.value) raf = requestAnimationFrame(frame);
    }
    sceneState.invalidate = invalidate;
    function frame(now: number) {
      raf = 0;
      if (disposed) return;
      // Clamped: a negative or huge gap (rAF timestamps can trail performance.now(); tabs sleep) must not blow up the easing.
      const dt = Math.min(Math.max((now - lastT) / 1000, 0), 0.1);
      lastT = now;
      if (!reduce) adapt(now);
      try {
        place(now, dt);
        renderer.render(scene, camera);
      } finally {
        // Keep going even if one frame throws. Hidden tabs pause animation frames by themselves, so no visibility check
        // (one stopped the loop for good when a page loaded in the background).
        if (!reduce && !disposed) raf = requestAnimationFrame(frame);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') lastT = performance.now();
    };
    document.addEventListener('visibilitychange', onVisible);
    if (reduce) still = setInterval(() => frame(performance.now()), 60_000);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      sceneState.project = null;
      sceneState.invalidate = null;
      glow.remove();
      camera.remove(rocket.group);
      rocket.dispose();
      if (still) clearInterval(still);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
      (earth.geometry === sphereHi ? sphereLo : sphereHi).dispose();
      // Tiers not currently on the globe (the one in use is freed with the materials below).
      loaded.forEach((t, i) => i !== tier && (t?.day.dispose(), t?.night.dispose()));
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.ShaderMaterial;
          Object.values(m.uniforms ?? {}).forEach((u) => (u.value as THREE.Texture | null)?.dispose?.());
          m.dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
    };
  }, [reduce]);

  return (
    <View ref={host as never} style={[StyleSheet.absoluteFill, styles.host]} pointerEvents="none" aria-hidden>
      {state !== 'ready' && <View style={[StyleSheet.absoluteFill, styles.fallback]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { backgroundColor: color.bg, overflow: 'hidden' },
  // Shown while textures load and when WebGL is unavailable: deep space with a faint blue horizon at the bottom.
  fallback: {
    backgroundImage: `radial-gradient(120% 60% at 50% 120%, rgba(70,130,255,0.35), rgba(20,40,90,0.15) 45%, ${color.bg} 75%)`,
  } as object,
});
