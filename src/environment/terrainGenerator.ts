import { CatmullRomCurve3, Vector3 } from 'three'
import { SimplexNoise, fbm, ridged, smoothstep, clamp, lerp, type Rand } from './noise'
import { WORLD, FEATURES, ROADS, type RoadDef } from './worldConfig'

export interface Road {
  def: RoadDef
  /** x,z pairs */
  pts: Float32Array
  heights: Float32Array
  n: number
  spacing: number
}

export interface Pad {
  x: number
  z: number
  radius: number
  /** pad is levelled to the terrain height at this point (defaults to its centre) */
  levelAt?: { x: number; z: number }
  /** filled in during carving */
  h: number
}

/**
 * Grid terrain. Vertex (ix, iz) has index iz * row + ix and sits at
 * x = -half + ix * cell, z = -half + iz * cell.
 * The render mesh and the Rapier trimesh collider are built from exactly
 * these arrays, so visuals and physics always match.
 */
export interface TerrainData {
  size: number
  segments: number
  cell: number
  half: number
  row: number
  count: number
  heights: Float32Array
  positions: Float32Array
  indices: Uint32Array
  uvs: Float32Array
  splat: Float32Array // grass, dirt, rock, mud weights per vertex (stride 4)
  colors: Float32Array // tint per vertex
  roadDist: Float32Array // distance from nearest road edge (negative = on road)
  slope: Float32Array
}

// ---------------------------------------------------------------------------
// Sampling helpers (exact match of the triangulation used for the mesh)
// ---------------------------------------------------------------------------

export function sampleHeight(t: TerrainData, x: number, z: number): number {
  const fx = (x + t.half) / t.cell
  const fz = (z + t.half) / t.cell
  const ix = clamp(Math.floor(fx), 0, t.segments - 1)
  const iz = clamp(Math.floor(fz), 0, t.segments - 1)
  const u = clamp(fx - ix, 0, 1)
  const v = clamp(fz - iz, 0, 1)
  const r = t.row
  const H = t.heights
  const hA = H[iz * r + ix]
  const hB = H[iz * r + ix + 1]
  const hC = H[(iz + 1) * r + ix]
  const hD = H[(iz + 1) * r + ix + 1]
  if (u + v <= 1) return hA + (hB - hA) * u + (hC - hA) * v
  return hD + (hC - hD) * (1 - u) + (hB - hD) * (1 - v)
}

/** Bilinear sample of any per-vertex scalar array. */
export function sampleField(t: TerrainData, arr: Float32Array, x: number, z: number, stride = 1, offset = 0): number {
  const fx = clamp((x + t.half) / t.cell, 0, t.segments - 0.0001)
  const fz = clamp((z + t.half) / t.cell, 0, t.segments - 0.0001)
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const u = fx - ix
  const v = fz - iz
  const r = t.row
  const a = arr[(iz * r + ix) * stride + offset]
  const b = arr[(iz * r + ix + 1) * stride + offset]
  const c = arr[((iz + 1) * r + ix) * stride + offset]
  const d = arr[((iz + 1) * r + ix + 1) * stride + offset]
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

/** Surface weights (grass, dirt, rock, mud) at a point, written into `out`. */
export function sampleSurfaceWeights(t: TerrainData, x: number, z: number, out: number[]) {
  let s = 0
  for (let i = 0; i < 4; i++) {
    out[i] = sampleField(t, t.splat, x, z, 4, i)
    s += out[i]
  }
  if (s > 0) for (let i = 0; i < 4; i++) out[i] /= s
  return out
}

/** 0..1 mud amount around a point (bogs + the gully bottom). */
export function mudZoneWeight(x: number, z: number) {
  let m = 0
  for (const zone of FEATURES.mudZones) {
    const d = Math.hypot(x - zone.x, z - zone.z)
    if (d < zone.r) m = Math.max(m, 1 - smoothstep(zone.r * 0.45, zone.r, d))
  }
  return m
}

// ---------------------------------------------------------------------------
// Height functions
// ---------------------------------------------------------------------------

export class TerrainShape {
  constructor(private n: SimplexNoise) {}

  /** 0 in the valley, 1 deep in the boundary mountains. */
  edgeFactor(x: number, z: number): number {
    const sq = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half
    const rad = Math.hypot(x, z) / WORLD.half
    const e = sq * 0.6 + rad * 0.4 + fbm(this.n, x * 0.006 + 90, z * 0.006 - 40, 3) * 0.07
    return smoothstep(0.6, 0.98, e)
  }

  /** Natural terrain before roads are carved. */
  base(x: number, z: number): number {
    const n = this.n
    let h = fbm(n, x * 0.0042, z * 0.0042, 4) * 19
    h += fbm(n, x * 0.016 + 31.7, z * 0.016 - 12.3, 3) * 3.6
    h += fbm(n, x * 0.07 - 7.1, z * 0.07 + 3.3, 2) * 0.45
    const edge = this.edgeFactor(x, z)
    if (edge > 0) h += edge * (48 + ridged(n, x * 0.011, z * 0.011, 4) * 75)
    const H = FEATURES.hill
    const hd2 = (x - H.x) ** 2 + (z - H.z) ** 2
    h += H.height * Math.exp(-hd2 / (2 * H.sigma * H.sigma))
    return h
  }

  /** Details applied after road carving so they also affect the trails. */
  post(x: number, z: number, h: number, rockyW: number, roughW = 0): number {
    const n = this.n
    if (roughW > 0) {
      // trail surface: rolling bumps, ledges and washouts (wavelength ≥ 6 m so the 2 m grid resolves them)
      const bumps = fbm(n, x * 0.14 + 41, z * 0.14 - 17, 2) * 0.42
      const ledges = (ridged(n, x * 0.09 + 3, z * 0.09 - 8, 2) - 0.45) * 0.38
      h += (bumps + ledges) * roughW
    }
    if (rockyW > 0) h += (fbm(n, x * 0.32, z * 0.32, 2) * 0.32 + 0.08) * rockyW
    const RG = FEATURES.rockGarden
    const rg = Math.hypot(x - RG.x, z - RG.z)
    if (rg < RG.radius + 10) {
      const m = 1 - smoothstep(RG.radius * 0.6, RG.radius + 10, rg)
      h += fbm(n, x * 0.18 + 5, z * 0.18 + 9, 2) * 1.1 * m
    }
    const mud = mudZoneWeight(x, z)
    if (mud > 0) h -= mud * 0.35 // bogs sit in a shallow, rutted dip
    const W = FEATURES.whoops
    const wd = Math.hypot(x - W.x, z - W.z)
    if (wd < W.radius) {
      const m = 1 - smoothstep(W.radius * 0.55, W.radius, wd)
      h += Math.sin(x * 0.55) * Math.sin(z * 0.55) * 0.65 * m
    }
    const G = FEATURES.gully
    const { d, t } = segmentDistance(x, z, G.ax, G.az, G.bx, G.bz)
    if (d < G.width * 4) {
      const endMask = smoothstep(0, 0.12, t) * (1 - smoothstep(0.88, 1, t))
      h -= G.depth * Math.exp(-(d * d) / (2 * G.width * G.width)) * endMask
    }
    return h
  }

  gullyMask(x: number, z: number): number {
    const G = FEATURES.gully
    const { d, t } = segmentDistance(x, z, G.ax, G.az, G.bx, G.bz)
    return Math.exp(-(d * d) / (2 * G.width * G.width)) * smoothstep(0, 0.12, t) * (1 - smoothstep(0.88, 1, t))
  }

  forestDensity(x: number, z: number): number {
    const f = smoothstep(-0.08, 0.32, fbm(this.n, x * 0.009 + 400, z * 0.009 - 250, 3))
    return clamp(f + this.edgeFactor(x, z) * 0.35, 0, 1)
  }
}

export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz || 1
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1)
  const cx = ax + dx * t
  const cz = az + dz * t
  return { d: Math.hypot(px - cx, pz - cz), t }
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

export function buildRoadCurves(): Road[] {
  return ROADS.map((def) => {
    const curve = new CatmullRomCurve3(
      def.control.map(([x, z]) => new Vector3(x, 0, z)),
      def.closed,
      'centripetal',
    )
    const len = curve.getLength()
    const segs = Math.max(8, Math.round(len / 3))
    const spaced = curve.getSpacedPoints(segs)
    const n = def.closed ? segs : segs + 1 // closed curves repeat the first point at the end
    const pts = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      pts[i * 2] = spaced[i].x
      pts[i * 2 + 1] = spaced[i].z
    }
    return { def, pts, heights: new Float32Array(n), n, spacing: len / segs }
  })
}

/** Point + heading on a road at the sample closest to (x, z). */
export function nearestRoadSample(road: Road, x: number, z: number) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < road.n; i++) {
    const d = (road.pts[i * 2] - x) ** 2 + (road.pts[i * 2 + 1] - z) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  const j = Math.min(best + 1, road.n - 1)
  const i0 = j === best ? best - 1 : best
  const dx = road.pts[j * 2] - road.pts[i0 * 2]
  const dz = road.pts[j * 2 + 1] - road.pts[i0 * 2 + 1]
  return { index: best, x: road.pts[best * 2], z: road.pts[best * 2 + 1], yaw: Math.atan2(dx, dz), h: road.heights[best] }
}

// ---------------------------------------------------------------------------
// Full terrain build
// ---------------------------------------------------------------------------

export function buildTerrain(shape: TerrainShape, noise: SimplexNoise, roads: Road[], pads: Pad[], rand: Rand): TerrainData {
  const size = WORLD.size
  const seg = WORLD.segments
  const half = size / 2
  const cell = size / seg
  const row = seg + 1
  const count = row * row

  const H = new Float32Array(count)
  for (let iz = 0; iz < row; iz++) {
    const z = -half + iz * cell
    for (let ix = 0; ix < row; ix++) H[iz * row + ix] = shape.base(-half + ix * cell, z)
  }

  const t: TerrainData = {
    size, segments: seg, cell, half, row, count,
    heights: H,
    positions: new Float32Array(count * 3),
    indices: new Uint32Array(seg * seg * 6),
    uvs: new Float32Array(count * 2),
    splat: new Float32Array(count * 4),
    colors: new Float32Array(count * 3),
    roadDist: new Float32Array(count).fill(1e6),
    slope: new Float32Array(count),
  }

  const dirtCore = new Float32Array(count)
  const rockyCore = new Float32Array(count)
  const roughCore = new Float32Array(count)
  const tmpDist = new Float32Array(count).fill(Infinity)
  const tmpH = new Float32Array(count)
  const touched: number[] = []

  // ----- carve roads one after another --------------------------------------
  for (const road of roads) {
    const { def, pts, n } = road
    // 1) sample current terrain along the road
    for (let i = 0; i < n; i++) road.heights[i] = sampleHeight(t, pts[i * 2], pts[i * 2 + 1])
    // 2) smooth the longitudinal profile
    const raw = road.heights.slice()
    const k = def.smoothWindow
    for (let i = 0; i < n; i++) {
      let s = 0
      let c = 0
      for (let o = -k; o <= k; o++) {
        let j = i + o
        if (def.closed) j = (j + n) % n
        else if (j < 0 || j >= n) continue
        s += raw[j]
        c++
      }
      road.heights[i] = s / c
    }
    // 3) limit the grade (forward + backward pass, twice for loops)
    const maxStep = def.maxGrade * road.spacing
    for (let pass = 0; pass < (def.closed ? 2 : 1); pass++) {
      for (let i = 1; i < n; i++) road.heights[i] = clamp(road.heights[i], road.heights[i - 1] - maxStep, road.heights[i - 1] + maxStep)
      for (let i = n - 2; i >= 0; i--) road.heights[i] = clamp(road.heights[i], road.heights[i + 1] - maxStep, road.heights[i + 1] + maxStep)
    }

    // 4) rasterise distance-to-road for this road
    const reach = def.halfWidth + def.shoulder + 16
    const segCount = def.closed ? n : n - 1
    for (let s = 0; s < segCount; s++) {
      const i0 = s
      const i1 = (s + 1) % n
      const ax = pts[i0 * 2], az = pts[i0 * 2 + 1]
      const bx = pts[i1 * 2], bz = pts[i1 * 2 + 1]
      const ha = road.heights[i0], hb = road.heights[i1]
      const minX = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / cell))
      const maxX = Math.min(seg, Math.ceil((Math.max(ax, bx) + reach + half) / cell))
      const minZ = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / cell))
      const maxZ = Math.min(seg, Math.ceil((Math.max(az, bz) + reach + half) / cell))
      for (let iz = minZ; iz <= maxZ; iz++) {
        const z = -half + iz * cell
        for (let ix = minX; ix <= maxX; ix++) {
          const x = -half + ix * cell
          const { d, t: u } = segmentDistance(x, z, ax, az, bx, bz)
          if (d > reach) continue
          const v = iz * row + ix
          if (tmpDist[v] === Infinity) touched.push(v)
          if (d < tmpDist[v]) {
            tmpDist[v] = d
            tmpH[v] = ha + (hb - ha) * u
          }
        }
      }
    }

    // 5) blend terrain toward the road surface (cut & fill with sloped banks)
    for (const v of touched) {
      const d = tmpDist[v]
      const delta = Math.abs(H[v] - tmpH[v])
      const outer = def.halfWidth + def.shoulder + Math.min(delta * 1.3, 14)
      if (d < outer) {
        const w = 1 - smoothstep(def.halfWidth, outer, d)
        H[v] = lerp(H[v], tmpH[v], w)
      }
      const core = 1 - smoothstep(def.halfWidth - 0.6, def.halfWidth + 1.4, d)
      if (def.kind === 'dirt') dirtCore[v] = Math.max(dirtCore[v], core)
      else rockyCore[v] = Math.max(rockyCore[v], core)
      roughCore[v] = Math.max(roughCore[v], (1 - smoothstep(def.halfWidth, def.halfWidth + 2.5, d)) * def.roughness)
      t.roadDist[v] = Math.min(t.roadDist[v], d - def.halfWidth)
      tmpDist[v] = Infinity
    }
    touched.length = 0
  }

  // ----- flat pads (fuel station, summit) -----------------------------------
  // roads keep their own surface: pads only reshape terrain off the road core
  const roadCore = new Float32Array(count)
  for (let v = 0; v < count; v++) roadCore[v] = Math.max(dirtCore[v], rockyCore[v])
  for (const pad of pads) {
    pad.h = sampleHeight(t, pad.levelAt?.x ?? pad.x, pad.levelAt?.z ?? pad.z)
    const outer = pad.radius + 9
    for (let iz = 0; iz < row; iz++) {
      const z = -half + iz * cell
      if (Math.abs(z - pad.z) > outer) continue
      for (let ix = 0; ix < row; ix++) {
        const x = -half + ix * cell
        const d = Math.hypot(x - pad.x, z - pad.z)
        if (d > outer) continue
        const v = iz * row + ix
        const w = (1 - smoothstep(pad.radius, outer, d)) * (1 - roadCore[v])
        H[v] = lerp(H[v], pad.h, w)
        dirtCore[v] = Math.max(dirtCore[v], 1 - smoothstep(pad.radius - 1, pad.radius + 2, d))
        t.roadDist[v] = Math.min(t.roadDist[v], d - pad.radius)
      }
    }
  }

  // ----- post detail (rocky trail roughness, whoops, gully, rock garden) ----
  for (let iz = 0; iz < row; iz++) {
    const z = -half + iz * cell
    for (let ix = 0; ix < row; ix++) {
      const v = iz * row + ix
      H[v] = shape.post(-half + ix * cell, z, H[v], rockyCore[v], roughCore[v])
    }
  }

  // ----- derived data: geometry, slope, splat, tint -------------------------
  const P = t.positions
  for (let iz = 0; iz < row; iz++) {
    for (let ix = 0; ix < row; ix++) {
      const v = iz * row + ix
      const x = -half + ix * cell
      const z = -half + iz * cell
      P[v * 3] = x
      P[v * 3 + 1] = H[v]
      P[v * 3 + 2] = z
      t.uvs[v * 2] = ix / seg
      t.uvs[v * 2 + 1] = iz / seg
      const hl = H[iz * row + Math.max(ix - 1, 0)]
      const hr = H[iz * row + Math.min(ix + 1, seg)]
      const hd = H[Math.max(iz - 1, 0) * row + ix]
      const hu = H[Math.min(iz + 1, seg) * row + ix]
      t.slope[v] = Math.hypot((hr - hl) / (2 * cell), (hu - hd) / (2 * cell))
    }
  }

  let k = 0
  for (let iz = 0; iz < seg; iz++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = iz * row + ix // (x, z)
      const b = a + 1 // (x+1, z)
      const c = a + row // (x, z+1)
      const d = c + 1 // (x+1, z+1)
      // counter-clockwise seen from above -> normals point up
      t.indices[k++] = a
      t.indices[k++] = c
      t.indices[k++] = b
      t.indices[k++] = c
      t.indices[k++] = d
      t.indices[k++] = b
    }
  }

  const RG = FEATURES.rockGarden
  for (let v = 0; v < count; v++) {
    const x = P[v * 3]
    const h = P[v * 3 + 1]
    const z = P[v * 3 + 2]
    const s = t.slope[v]
    let rock = smoothstep(0.62, 0.95, s)
    rock = Math.max(rock, smoothstep(62, 92, h) * 0.85)
    rock = Math.max(rock, rockyCore[v] * 0.72)
    const rgd = Math.hypot(x - RG.x, z - RG.z)
    rock = Math.max(rock, (1 - smoothstep(RG.radius * 0.5, RG.radius + 6, rgd)) * 0.45)
    let dirt = Math.min(1, dirtCore[v] + rockyCore[v] * 0.28 + shape.gullyMask(x, z) * 0.55)
    dirt = Math.max(dirt, smoothstep(0.5, 0.75, fbm(noise, x * 0.021 + 70, z * 0.021 - 30, 3)) * 0.55)
    dirt *= 1 - rock * 0.85
    let mud = Math.max(mudZoneWeight(x, z), shape.gullyMask(x, z) * 0.7)
    mud = Math.max(mud, smoothstep(0.66, 0.82, fbm(noise, x * 0.034 + 11, z * 0.034 - 7, 2)) * (1 - smoothstep(0.08, 0.25, s)) * 0.8)
    mud *= 1 - rock
    dirt *= 1 - mud
    const grass = Math.max(0, 1 - dirt - rock - mud)
    const sum = grass + dirt + rock + mud || 1
    t.splat[v * 4] = grass / sum
    t.splat[v * 4 + 1] = dirt / sum
    t.splat[v * 4 + 2] = rock / sum
    t.splat[v * 4 + 3] = mud / sum

    // tint: dry/lush grass variation, forest floor darkening, snow-dusted peaks
    const dry = smoothstep(-0.25, 0.6, fbm(noise, x * 0.011 + 200, z * 0.011, 3))
    const forest = shape.forestDensity(x, z)
    const shade = (1 - forest * 0.16) * (0.96 + rand() * 0.08)
    let r = lerp(0.95, 1.16, dry) * shade
    let g = lerp(1.02, 1.03, dry) * shade
    let b = lerp(0.95, 0.72, dry) * shade
    const snow = smoothstep(96, 118, h) * (1 - smoothstep(1.1, 1.6, s))
    r = lerp(r, 1.9, snow)
    g = lerp(g, 1.95, snow)
    b = lerp(b, 2.1, snow)
    t.colors[v * 3] = r
    t.colors[v * 3 + 1] = g
    t.colors[v * 3 + 2] = b
  }

  return t
}
