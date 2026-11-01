// The live planet behind every screen (owner's live-planet direction, Nov 1, 2026). three.js on a fixed full-window
// canvas. What is real: the sunlight. Day and night fall where they fall right now (subsolar point from the clock),
// and the stars sit where they are over Earth (sidereal time). What is presentation: the camera's slow drift, the
// spin that scrolling adds, the glow. Reduced motion: one still frame, redrawn each minute as the sun moves.
import { geoEquirectangular, geoPath } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { land } from '@/lib/geo';
import { scene as sceneState } from '@/lib/scene';
import { greenwichSiderealDeg, latLngToUnit, subsolarPoint } from '@/lib/sun';
import { color } from '@/theme';
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
// Where the camera hangs: south of the places we look across, so the horizon runs over the populated mid-latitudes,
// and east of the subsolar point, so the evening terminator and its city lights cross the view.
const CAMERA_LAT = -26;
const CAMERA_EAST_OF_SUN = 78;
const DRIFT_DEG = 22; // gentle orbit: ±22° over DRIFT_PERIOD
const DRIFT_PERIOD_S = 360;

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
    const big = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1) > 1800;
    const res = big ? '4k' : '2k';
    const loader = new THREE.TextureLoader();
    const load = (name: string, srgb = true, size = res) =>
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
    };
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 96),
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
      new THREE.SphereGeometry(1.055, 128, 96),
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
      new THREE.SphereGeometry(200, 64, 32),
      new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: worldVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false }),
    );
    sky.renderOrder = -1;

    const sunQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: sunFragment, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    sunQuad.scale.setScalar(70);

    scene.add(sky, earth, atmosphere, sunQuad);
    // Development only: lets the browser console inspect the scene.
    if (__DEV__) (window as unknown as { __planet: object }).__planet = { renderer, scene, camera, earth, sky, atmosphere, sunQuad, state: sceneState };

    let disposed = false;
    // Stars always come from the 4K map: at 2K each star is under a pixel and smears when magnified.
    Promise.all([load('day'), load('night'), load('stars', true, '4k')])
      .then(([day, night, stars]) => {
        if (disposed) return;
        earthUniforms.dayMap.value = day;
        earthUniforms.nightMap.value = night;
        // Stars wrap at RA 0h; without mipmaps there's no seam line where the texture's edges meet.
        stars.generateMipmaps = false;
        stars.minFilter = THREE.LinearFilter;
        skyUniforms.starMap.value = stars;
        setState('ready');
        frame(performance.now());
      })
      .catch(() => !disposed && setState('failed'));

    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    // Camera state, eased toward what the page asks for.
    let p = sceneState.progress;
    let spin = 0;
    let lastT = performance.now();
    let sunAt = 0;
    const up = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const target = new THREE.Vector3();

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
      const d = mix(DIST[0], DIST[1], e);
      const drift = reduce ? 0 : DRIFT_DEG * Math.sin(((now / 1000) * 2 * Math.PI) / DRIFT_PERIOD_S);
      const lng = sun.lng + CAMERA_EAST_OF_SUN + drift + spin;
      if (__DEV__) Object.assign((window as unknown as { __planet: object }).__planet, { dbg: { lng, sunLng: sun.lng, drift, spin, p, dt, vel: sceneState.velocity } });
      const pos = new THREE.Vector3(...latLngToUnit(CAMERA_LAT, lng)).multiplyScalar(d);

      // Look from the camera toward Earth's centre, then pitch up so the horizon lands at LIMB_Y on screen.
      const alpha = Math.asin(1 / d);
      const theta = alpha - Math.atan(mix(LIMB_Y[0], LIMB_Y[1], e) * Math.tan((FOV / 2) * RAD));
      const f0 = pos.clone().negate().normalize();
      right.crossVectors(f0, new THREE.Vector3(0, 1, 0)).normalize();
      up.crossVectors(right, f0).normalize();
      fwd.copy(f0).multiplyScalar(Math.cos(theta)).addScaledVector(up, Math.sin(theta));
      const upPitched = up.clone().multiplyScalar(Math.cos(theta)).addScaledVector(f0, -Math.sin(theta));
      camera.position.copy(pos);
      camera.up.copy(upPitched);
      camera.lookAt(target.copy(pos).add(fwd));
      camera.rotateZ(mix(ROLL[0], ROLL[1], e) * RAD);

      skyUniforms.haze.value = mix(HAZE[0], HAZE[1], e);
      sky.position.copy(pos);
      sunQuad.position.copy(pos).addScaledVector(earthUniforms.sunDir.value, 150);
      sunQuad.quaternion.copy(camera.quaternion);
    }

    let raf = 0;
    let still: ReturnType<typeof setInterval> | undefined;
    function frame(now: number) {
      raf = 0;
      if (disposed) return;
      // Clamped: a negative or huge gap (rAF timestamps can trail performance.now(); tabs sleep) must not blow up the easing.
      const dt = Math.min(Math.max((now - lastT) / 1000, 0), 0.1);
      lastT = now;
      place(now, dt);
      renderer.render(scene, camera);
      if (!reduce && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !raf && !reduce) {
        lastT = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    if (reduce) still = setInterval(() => frame(performance.now()), 60_000);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (still) clearInterval(still);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
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
