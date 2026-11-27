import {
  BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Float32BufferAttribute, Color,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SimplexNoise, mulberry32, noise3 } from './noise'

export const ROCK_VARIANTS = 4

/** Displacement applied to a unit-sphere direction – shared by visuals and colliders. */
function rockRadius(n: SimplexNoise, x: number, y: number, z: number, variant: number) {
  const o = variant * 13.7
  return 1 + noise3(n, x * 1.4 + o, y * 1.4 - o, z * 1.4) * 0.28 + noise3(n, x * 3.6 - o, y * 3.6, z * 3.6 + o) * 0.08
}

function displace(geo: BufferGeometry, n: SimplexNoise, variant: number) {
  const p = geo.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    let y = p.getY(i)
    let z = p.getZ(i)
    const l = Math.hypot(x, y, z) || 1
    x /= l
    y /= l
    z /= l
    const r = rockRadius(n, x, y, z, variant)
    let py = y * r
    if (py < -0.35) py = -0.35 + (py + 0.35) * 0.3 // flatter base so rocks sit on the ground
    p.setXYZ(i, x * r, py, z * r)
  }
  p.needsUpdate = true
}

const rockNoise = new SimplexNoise(mulberry32(4242))
const rockGeoCache = new Map<string, BufferGeometry>()
const rockHullCache: Float32Array[] = []

/** Faceted render geometry for a rock variant (unit size). `detail` 1 = 80 faces, 2 = 320 faces. */
export function getRockGeometry(variant: number, detail = 2): BufferGeometry {
  const key = `${variant}:${detail}`
  let geo = rockGeoCache.get(key)
  if (!geo) {
    geo = new IcosahedronGeometry(1, detail)
    displace(geo, rockNoise, variant)
    geo.computeVertexNormals() // non-indexed -> faceted look
    geo.computeBoundingSphere()
    rockGeoCache.set(key, geo)
  }
  return geo
}

/** Low-detail point cloud of the same rock, for convex-hull colliders. */
export function getRockHullPoints(variant: number): Float32Array {
  if (!rockHullCache[variant]) {
    const geo = mergeVertices(new IcosahedronGeometry(1, 1))
    displace(geo, rockNoise, variant)
    rockHullCache[variant] = new Float32Array(geo.getAttribute('position').array)
  }
  return rockHullCache[variant]
}

export function colorize(geo: BufferGeometry, color: Color, jitter: number, seed: number) {
  const rand = mulberry32(seed)
  const g = geo.index ? geo.toNonIndexed() : geo
  const count = g.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 3) {
    const k = 1 - jitter / 2 + rand() * jitter
    for (let j = 0; j < 3; j++) {
      colors[(i + j) * 3] = color.r * k
      colors[(i + j) * 3 + 1] = color.g * k
      colors[(i + j) * 3 + 2] = color.b * k
    }
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

/** Pine: trunk and foliage separate so each uses its own material. Height ≈ 9 m at scale 1. */
export function createPineGeometries() {
  const trunk = new CylinderGeometry(0.13, 0.26, 3.2, 7, 1)
  trunk.translate(0, 1.6, 0)
  const layers: BufferGeometry[] = []
  const tiers = [
    { r: 2.0, h: 3.4, y: 3.4 },
    { r: 1.6, h: 3.0, y: 5.0 },
    { r: 1.15, h: 2.6, y: 6.5 },
    { r: 0.7, h: 2.0, y: 7.9 },
  ]
  tiers.forEach((t, i) => {
    const cone = new ConeGeometry(t.r, t.h, 8, 1, false)
    cone.rotateY(i * 0.7)
    cone.translate(0, t.y, 0)
    layers.push(colorize(cone, new Color('#2f4a26').offsetHSL(0, 0, i * 0.02), 0.25, 10 + i))
  })
  const foliage = mergeGeometries(layers)!
  foliage.computeVertexNormals()
  return { trunk, foliage }
}

/** Broadleaf tree: trunk + cluster of lumpy blobs. Height ≈ 7 m at scale 1. */
export function createBroadleafGeometries() {
  const trunk = new CylinderGeometry(0.16, 0.3, 3.4, 7, 1)
  trunk.translate(0, 1.7, 0)
  const rand = mulberry32(77)
  const blobs: BufferGeometry[] = []
  const spots = [
    [0, 4.6, 0, 1.9], [1.1, 4.0, 0.4, 1.3], [-1.0, 4.2, -0.5, 1.4], [0.3, 5.6, -0.6, 1.3], [-0.4, 4.0, 1.0, 1.2],
  ]
  spots.forEach(([x, y, z, r], i) => {
    const b = new IcosahedronGeometry(r, 1)
    const p = b.getAttribute('position')
    for (let k = 0; k < p.count; k++) {
      const s = 0.85 + rand() * 0.3
      p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.85, p.getZ(k) * s)
    }
    b.translate(x, y, z)
    blobs.push(colorize(b, new Color('#47612c'), 0.3, 30 + i))
  })
  const foliage = mergeGeometries(blobs)!
  foliage.computeVertexNormals()
  return { trunk, foliage }
}

/** Low bush blob. */
export function createBushGeometry() {
  const b = new IcosahedronGeometry(1, 1)
  const rand = mulberry32(5)
  const p = b.getAttribute('position')
  for (let k = 0; k < p.count; k++) {
    const s = 0.8 + rand() * 0.35
    p.setXYZ(k, p.getX(k) * s, Math.max(-0.2, p.getY(k) * s * 0.7), p.getZ(k) * s)
  }
  const g = colorize(b, new Color('#3f5a27'), 0.3, 99)
  g.computeVertexNormals()
  return g
}

/** One grass tuft: several thin blades fanned around the origin, coloured base→tip. */
export function createGrassTuftGeometry() {
  const rand = mulberry32(31)
  const positions: number[] = []
  const colors: number[] = []
  const base = new Color('#3c5224')
  const tip = new Color('#9aa858')
  const blades = 7
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand() * 0.6
    const r = 0.05 + rand() * 0.12
    const bx = Math.cos(a) * r
    const bz = Math.sin(a) * r
    const h = 0.32 + rand() * 0.32
    const lean = 0.12 + rand() * 0.15
    const w = 0.035 + rand() * 0.02
    const px = -Math.sin(a) * w
    const pz = Math.cos(a) * w
    positions.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean)
    const tipCol = tip.clone().offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1)
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tipCol.r, tipCol.g, tipCol.b)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  // normals point up so tufts shade like the ground they sit on
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  return g
}

/** Trunk + foliage merged into one vertex-coloured geometry (one draw call per chunk). */
export function createTreeGeometry(species: 0 | 1) {
  const g = species === 0 ? createPineGeometries() : createBroadleafGeometries()
  const trunk = colorize(g.trunk, new Color(species === 0 ? '#5a3f2b' : '#6a4a30'), 0.2, 3)
  trunk.computeVertexNormals()
  for (const geo of [trunk, g.foliage]) {
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(name)) geo.deleteAttribute(name)
  }
  const merged = mergeGeometries([trunk, g.foliage])!
  merged.computeBoundingSphere()
  return merged
}
