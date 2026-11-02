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
import { atmosphereFragment, earthFragment, quadVertex, skyFragment, sunFragment, worldVertex } from './planet-shaders';

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
    const loader = new THREE.TextureLoader();
    const load = (name: string, srgb = true, size: Tier = res) =>
      new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(`${BASE}/planet/${name}-${size}.jpg`, (t) => {
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
      starMap: { value: null as THREE.Texture | null },
      gmst: { value: greenwichSiderealDeg(Date.now()) * RAD },
      haze: { value: HAZE[0] as number },
      starGain: { value: 3.2 },
      sunDir: earthUniforms.sunDir,
    };
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
    scene.add(sky, earth, atmosphere, sunQuad);
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
        big?.day.dispose();
        big?.night.dispose();
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

    // Stars always come from the 4K map: at 2K each star is under a pixel and smears when magnified.
    Promise.all([load('day'), load('night'), load('stars', true, '4k')])
      .then(([day, night, stars]) => {
        if (disposed) return;
        earthUniforms.dayMap.value = day;
        earthUniforms.nightMap.value = night;
        loaded[tier] = { day, night };
        readyAt = performance.now();
        // Stars wrap at RA 0h; without mipmaps there's no seam line where the texture's edges meet.
        stars.generateMipmaps = false;
        stars.minFilter = THREE.LinearFilter;
        skyUniforms.starMap.value = stars;
        setState('ready');
        invalidate();
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
      // Projects rides a rocket (batch P): there scrolling climbs a little higher instead of descending, and the camera
      // floats on two summed sines so the rocket parallaxes against Earth and the stars.
      rocketMix = easeTo(rocketMix, sceneState.angle === 'projects' && sceneState.preset !== 'world' && !sceneState.visit ? 1 : 0, dt, 1.6);
      const rk = rocketMix * rocketMix * (3 - 2 * rocketMix);
      const ts = now / 1000;
      const float = reduce ? 0 : rk;
      const d = mix(mix(DIST[0], DIST[1], e), DIST[0] + 0.22 * e, rk);
      const drift =
        (reduce ? 0 : DRIFT_DEG * Math.sin(((now / 1000) * 2 * Math.PI) / DRIFT_PERIOD_S)) +
        float * (2.2 * Math.sin(ts * 0.19) + 1.1 * Math.sin(ts * 0.41 + 2));
      // Ease toward the page's angle (the shorter way round in longitude).
      const goalAngle = ANGLES[sceneState.angle];
      const ka = reduce ? 1 : 1 - Math.exp(-dt * 1.8);
      angle.lat += (goalAngle.lat - angle.lat) * ka;
      angle.east += ((((goalAngle.east - angle.east + 180) % 360) + 360) % 360 - 180) * ka;
      angle.roll += (goalAngle.roll - angle.roll) * ka;
      const lng = sun.lng + angle.east + drift + spin;
      if (__DEV__) Object.assign((window as unknown as { __planet: object }).__planet, { dbg: { lng, sunLng: sun.lng, drift, spin, p, dt, vel: sceneState.velocity } });
      const lat = angle.lat + float * (1.2 * Math.sin(ts * 0.23 + 1) + 0.6 * Math.sin(ts * 0.53));
      const pos = posV.set(...latLngToUnit(lat, lng)).multiplyScalar(d);

      // Look from the camera toward Earth's centre, then pitch up so the horizon lands at LIMB_Y on screen.
      const alpha = Math.asin(1 / d);
      const theta = alpha - Math.atan(mix(mix(LIMB_Y[0], LIMB_Y[1], e), LIMB_Y[0] - 0.12 * e, rk) * Math.tan((FOV / 2) * RAD));
      const f0 = f0v.copy(pos).negate().normalize();
      right.crossVectors(f0, Y_UP).normalize();
      up.crossVectors(right, f0).normalize();
      fwd.copy(f0).multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta));
      const upPitched = upP.copy(up).multiplyScalar(Math.cos(theta)).addScaledVector(f0, -Math.sin(theta));
      orbitRig.position.copy(pos);
      orbitRig.up.copy(upPitched);
      orbitRig.lookAt(target.copy(pos).add(fwd));
      orbitRig.rotateZ((mix(mix(ROLL[0], ROLL[1], e), 0, rk) + angle.roll + float * (1.5 * Math.sin(ts * 0.27) + 0.7 * Math.sin(ts * 0.61 + 1))) * RAD);

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

      skyUniforms.haze.value = mix(HAZE[0], HAZE[1], e) * (1 - mw) * (1 - v);
      sky.position.copy(camera.position);
      const sunDir = earthUniforms.sunDir.value;
      sunQuad.position.copy(camera.position).addScaledVector(sunDir, 150);
      sunQuad.quaternion.copy(camera.quaternion);
      placeGlow(sunDir);
      rocket.update(dt, now, rocketMix, camera.aspect, FOV, sunView.copy(sunDir).transformDirection(camera.matrixWorldInverse), reduce);

      // Finer sphere only when Earth's radius on screen passes ~520 px.
      const rPx = ((viewport.h / 2) * Math.tan(Math.asin(Math.min(1 / camera.position.length(), 1)))) / tanHalf;
      const geo = rPx > 520 ? sphereHi : sphereLo;
      if (earth.geometry !== geo) earth.geometry = atmosphere.geometry = geo;
      if (fillsVersion !== sceneState.fillsVersion) {
        fillsVersion = sceneState.fillsVersion;
        paintFills(fillCanvas, sceneState.fills);
        fillTexture.needsUpdate = true;
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
