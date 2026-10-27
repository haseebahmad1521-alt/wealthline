import * as THREE from 'three';

// Collects many static primitives (boxes, cylinders, spheres) with their own
// colours and merges them into one vertex-coloured mesh, so a whole street of
// houses costs a single draw call on phones.

export class Builder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix: THREE.Matrix4): this {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const c = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      this.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      this.colors.push(c.r, c.g, c.b);
    }
    g.dispose();
    return this;
  }

  box(
    color: THREE.ColorRepresentation,
    size: [number, number, number],
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ): this {
    return this.add(BOX, color, compose(pos, rot, size));
  }

  cylinder(
    color: THREE.ColorRepresentation,
    radius: number,
    height: number,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    topScale = 1,
  ): this {
    const geo = topScale === 1 ? CYL : new THREE.CylinderGeometry(topScale, 1, 1, 14);
    return this.add(geo, color, compose(pos, rot, [radius, height, radius]));
  }

  sphere(color: THREE.ColorRepresentation, r: number, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1]): this {
    return this.add(SPH, color, compose(pos, [0, 0, 0], [r * scale[0], r * scale[1], r * scale[2]]));
  }

  dome(color: THREE.ColorRepresentation, r: number, pos: [number, number, number], stretch = 1): this {
    return this.add(DOME, color, compose(pos, [0, 0, 0], [r, r * stretch, r]));
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const SPH = new THREE.SphereGeometry(1, 14, 10);
const DOME = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
export function compose(pos: [number, number, number], rot: [number, number, number], scale: [number, number, number]) {
  tmpE.set(rot[0], rot[1], rot[2]);
  tmpQ.setFromEuler(tmpE);
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), tmpQ, new THREE.Vector3(...scale));
}

/** Small seeded PRNG for repeatable street layouts. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
