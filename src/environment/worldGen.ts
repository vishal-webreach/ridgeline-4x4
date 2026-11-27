import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { SimplexNoise, mulberry32, randRange, smoothstep, type Rand } from './noise'
import { WORLD, FEATURES } from './worldConfig'
import {
  TerrainShape, buildRoadCurves, buildTerrain, nearestRoadSample, sampleField, sampleHeight,
  type Pad, type Road, type TerrainData,
} from './terrainGenerator'
import { createTerrainTextures, type TerrainTextures } from './textures'
import { ROCK_VARIANTS } from './propGeometry'
import { PROFILES, type QualityTier } from '../game/quality'

export interface TreeInstance { x: number; y: number; z: number; scale: number; rot: number; species: 0 | 1; tint: number }
export interface RockInstance {
  x: number; y: number; z: number
  sx: number; sy: number; sz: number
  q: [number, number, number, number]
  variant: number
}
export interface PropInstance { x: number; y: number; z: number; scale: number; rot: number }
export interface GrassChunk { matrices: Float32Array; count: number; cx: number; cz: number; radius: number }
export interface Placement { x: number; y: number; z: number; yaw: number }
export interface Marker { x: number; y: number; z: number; label: string; color: string }
/** Fallen log lying across a trail or in the forest. */
export interface LogInstance { x: number; y: number; z: number; yaw: number; length: number; radius: number }

export interface WorldData {
  tier: QualityTier
  terrain: TerrainData
  roads: Road[]
  trees: TreeInstance[]
  rocks: RockInstance[]
  bushes: PropInstance[]
  logs: LogInstance[]
  grass: GrassChunk[]
  spawn: Placement
  fuelStation: Placement
  markers: Marker[]
  textures: TerrainTextures
}

export const GRASS_CHUNK = 64

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

const cache = new Map<QualityTier, WorldData>()

export async function generateWorld(tier: QualityTier, onProgress: (p: number, label: string) => void): Promise<WorldData> {
  const cached = cache.get(tier)
  if (cached) {
    onProgress(0.85, 'World ready')
    return cached
  }
  const q = PROFILES[tier]
  const rand = mulberry32(WORLD.seed)
  const noise = new SimplexNoise(mulberry32(WORLD.seed * 7 + 3))
  const shape = new TerrainShape(noise)

  onProgress(0.05, 'Surveying the valley…')
  await tick()
  const roads = buildRoadCurves()
  const loop = roads.find((r) => r.def.id === 'loop')!
  const summit = roads.find((r) => r.def.id === 'summit')!

  // spawn on the main loop; fuel station on a flat pad beside it
  const sp = nearestRoadSample(loop, FEATURES.spawnNear.x, FEATURES.spawnNear.z)
  const leftX = Math.cos(sp.yaw)
  const leftZ = -Math.sin(sp.yaw)
  const fuelPad: Pad = { x: sp.x + leftX * 14, z: sp.z + leftZ * 14, radius: 8.5, levelAt: { x: sp.x, z: sp.z }, h: 0 }
  const summitEnd = { x: summit.pts[(summit.n - 1) * 2], z: summit.pts[(summit.n - 1) * 2 + 1] }
  const summitPad: Pad = { x: summitEnd.x, z: summitEnd.z, radius: 9, h: 0 }

  onProgress(0.12, 'Sculpting mountains and carving trails…')
  await tick()
  const terrain = buildTerrain(shape, noise, roads, [fuelPad, summitPad], rand)

  onProgress(0.42, 'Painting terrain textures…')
  await tick()
  const textures = createTerrainTextures(q.textureSize)

  const spawnRoad = nearestRoadSample(loop, FEATURES.spawnNear.x, FEATURES.spawnNear.z)
  const spawn: Placement = {
    x: spawnRoad.x,
    z: spawnRoad.z,
    y: sampleHeight(terrain, spawnRoad.x, spawnRoad.z),
    yaw: spawnRoad.yaw,
  }
  const fuelStation: Placement = { x: fuelPad.x, z: fuelPad.z, y: sampleHeight(terrain, fuelPad.x, fuelPad.z), yaw: spawnRoad.yaw }

  const H = FEATURES.hill
  const markers: Marker[] = [
    { x: H.x, z: H.z, y: sampleHeight(terrain, H.x, H.z), label: 'Hill Climb Summit', color: '#e3a33b' },
    { x: summitPad.x, z: summitPad.z, y: sampleHeight(terrain, summitPad.x, summitPad.z), label: 'Ridge Summit', color: '#d8462f' },
  ]

  // keep-out zones for props
  const keepOut: { x: number; z: number; r: number }[] = [
    { x: spawn.x, z: spawn.z, r: 22 },
    { x: fuelPad.x, z: fuelPad.z, r: 16 },
    { x: summitPad.x, z: summitPad.z, r: 12 },
  ]
  const blocked = (x: number, z: number, extra = 0) => keepOut.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < (k.r + extra) ** 2)

  onProgress(0.55, 'Planting the forest…')
  await tick()
  const trees = placeTrees(terrain, shape, rand, q.trees, blocked)

  onProgress(0.65, 'Placing boulders and rock gardens…')
  await tick()
  const rocks = placeRocks(terrain, shape, roads, rand, blocked)

  onProgress(0.75, 'Growing grass…')
  await tick()
  const bushes = placeBushes(terrain, rand, q.bushes, blocked)
  const grass = placeGrass(terrain, rand, q.grass, blocked)
  const logs = placeLogs(terrain, shape, roads, rand, blocked)

  const world: WorldData = { tier, terrain, roads, trees, rocks, bushes, logs, grass, spawn, fuelStation, markers, textures }
  cache.clear() // keep a single world in memory (mobile friendly)
  cache.set(tier, world)
  onProgress(0.85, 'World ready')
  return world
}

// ---------------------------------------------------------------------------

function placeTrees(t: TerrainData, shape: TerrainShape, rand: Rand, target: number, blocked: (x: number, z: number) => boolean) {
  const trees: TreeInstance[] = []
  const lim = WORLD.boundary - 4
  const H = FEATURES.hill
  const RG = FEATURES.rockGarden
  for (let trial = 0; trial < target * 25 && trees.length < target; trial++) {
    const x = randRange(rand, -lim, lim)
    const z = randRange(rand, -lim, lim)
    if (rand() > shape.forestDensity(x, z) * 0.9 + 0.03) continue
    if (sampleField(t, t.roadDist, x, z) < 3.5) continue
    if (sampleField(t, t.slope, x, z) > 0.75) continue
    const y = sampleHeight(t, x, z)
    if (y > 98) continue
    if (Math.hypot(x - H.x, z - H.z) < 34) continue
    if (Math.hypot(x - RG.x, z - RG.z) < RG.radius + 4) continue
    if (blocked(x, z)) continue
    trees.push({
      x, y: y - 0.15, z,
      scale: randRange(rand, 0.75, 1.45),
      rot: rand() * Math.PI * 2,
      species: rand() < 0.72 ? 0 : 1,
      tint: randRange(rand, 0.8, 1.15),
    })
  }
  return trees
}

const _q = new Quaternion()
const _e = new Euler()

function makeRock(t: TerrainData, rand: Rand, x: number, z: number, scale: number, sink: number, flatten = 1): RockInstance {
  _e.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5)
  _q.setFromEuler(_e)
  const sy = scale * randRange(rand, 0.55, 0.9) * flatten
  return {
    x, z,
    y: sampleHeight(t, x, z) - sy * sink,
    sx: scale * randRange(rand, 0.8, 1.25),
    sy,
    sz: scale * randRange(rand, 0.8, 1.25),
    q: [_q.x, _q.y, _q.z, _q.w],
    variant: Math.floor(rand() * ROCK_VARIANTS),
  }
}

function placeRocks(t: TerrainData, shape: TerrainShape, roads: Road[], rand: Rand, blocked: (x: number, z: number, extra?: number) => boolean) {
  const rocks: RockInstance[] = []
  const lim = WORLD.boundary - 6

  // 1) rock garden – dense boulders with drivable gaps
  const RG = FEATURES.rockGarden
  const garden: { x: number; z: number; r: number }[] = []
  for (let trial = 0; trial < 3000 && garden.length < 110; trial++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * RG.radius
    const x = RG.x + Math.cos(a) * d
    const z = RG.z + Math.sin(a) * d
    const s = randRange(rand, 0.45, 1.5)
    if (garden.some((g) => Math.hypot(g.x - x, g.z - z) < g.r + s + 2.2)) continue
    garden.push({ x, z, r: s })
    rocks.push(makeRock(t, rand, x, z, s, 0.3))
  }

  // 2) trails – wheel-sized stones scattered on the tracks (the rocky trail is the worst)
  for (const road of roads) {
    const isRocky = road.def.kind === 'rocky'
    const perSample = isRocky ? 0.75 : (road.def.rocks / 10) * road.spacing
    if (perSample <= 0) continue
    for (let i = 2; i < road.n - 2; i++) {
      let count = Math.floor(perSample) + (rand() < perSample % 1 ? 1 : 0)
      if (isRocky && i % 2) count = 0
      if (!count) continue
      const px = road.pts[i * 2]
      const pz = road.pts[i * 2 + 1]
      const nx = road.pts[(i + 1) * 2] - px
      const nz = road.pts[(i + 1) * 2 + 1] - pz
      const l = Math.hypot(nx, nz) || 1
      const sideX = -nz / l
      const sideZ = nx / l
      for (let c = 0; c < count; c++) {
        const off = randRange(rand, -road.def.halfWidth - 1, road.def.halfWidth + 1)
        const x = px + sideX * off + randRange(rand, -1, 1)
        const z = pz + sideZ * off + randRange(rand, -1, 1)
        if (blocked(x, z)) continue
        const big = rand() < (isRocky ? 0.3 : 0.15)
        rocks.push(makeRock(t, rand, x, z, big ? randRange(rand, 0.7, 1.05) : randRange(rand, 0.28, 0.68), 0.38, 0.75))
      }
    }
  }

  // 3) hill climb – outcrops on the flanks
  const H = FEATURES.hill
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2
    const d = randRange(rand, 8, 44)
    const x = H.x + Math.cos(a) * d
    const z = H.z + Math.sin(a) * d
    if (sampleField(t, t.roadDist, x, z) < 2) continue
    rocks.push(makeRock(t, rand, x, z, randRange(rand, 0.5, 1.4), 0.35))
  }

  // 4) roadside rocks on the summit trail cuttings
  const summit = roads.find((r) => r.def.id === 'summit')!
  for (let i = 4; i < summit.n - 4; i += 3) {
    const px = summit.pts[i * 2]
    const pz = summit.pts[i * 2 + 1]
    const nx = summit.pts[(i + 1) * 2] - px
    const nz = summit.pts[(i + 1) * 2 + 1] - pz
    const l = Math.hypot(nx, nz) || 1
    const side = rand() < 0.5 ? -1 : 1
    const off = side * (summit.def.halfWidth + randRange(rand, 1.5, 4.5))
    const x = px + (-nz / l) * off
    const z = pz + (nx / l) * off
    if (blocked(x, z)) continue
    rocks.push(makeRock(t, rand, x, z, randRange(rand, 0.6, 1.6), 0.35))
  }

  // 5) scattered boulders across the valley
  for (let trial = 0; trial < 4000 && rocks.length < 780; trial++) {
    const x = randRange(rand, -lim, lim)
    const z = randRange(rand, -lim, lim)
    if (sampleField(t, t.roadDist, x, z) < 2.5) continue
    if (blocked(x, z, 6)) continue
    if (shape.edgeFactor(x, z) > 0.5) continue
    const big = rand() < 0.2
    rocks.push(makeRock(t, rand, x, z, big ? randRange(rand, 1.8, 3.2) : randRange(rand, 0.6, 1.6), 0.35))
  }

  // 6) large cliffs/boulders in the boundary mountains
  for (let trial = 0; trial < 3000 && rocks.length < 860; trial++) {
    const x = randRange(rand, -lim, lim)
    const z = randRange(rand, -lim, lim)
    if (shape.edgeFactor(x, z) < 0.55) continue
    if (sampleField(t, t.roadDist, x, z) < 4) continue
    rocks.push(makeRock(t, rand, x, z, randRange(rand, 3, 7), 0.4))
  }
  return rocks
}

function placeBushes(t: TerrainData, rand: Rand, target: number, blocked: (x: number, z: number) => boolean) {
  const out: PropInstance[] = []
  const lim = WORLD.boundary - 8
  for (let trial = 0; trial < target * 20 && out.length < target; trial++) {
    const x = randRange(rand, -lim, lim)
    const z = randRange(rand, -lim, lim)
    if (sampleField(t, t.roadDist, x, z) < 1.5) continue
    if (sampleField(t, t.splat, x, z, 4, 0) < 0.5) continue
    if (sampleField(t, t.slope, x, z) > 0.7) continue
    if (blocked(x, z)) continue
    out.push({ x, z, y: sampleHeight(t, x, z) - 0.1, scale: randRange(rand, 0.5, 1.2), rot: rand() * Math.PI * 2 })
  }
  return out
}

function placeGrass(t: TerrainData, rand: Rand, target: number, blocked: (x: number, z: number) => boolean): GrassChunk[] {
  const lim = WORLD.boundary - 2
  const per = Math.ceil((WORLD.size) / GRASS_CHUNK)
  const buckets: number[][] = Array.from({ length: per * per }, () => [])
  const clump = new SimplexNoise(mulberry32(808))
  const m = new Matrix4()
  const pos = new Vector3()
  const scl = new Vector3()
  const quat = new Quaternion()
  const up = new Vector3(0, 1, 0)
  let placed = 0
  for (let trial = 0; trial < target * 6 && placed < target; trial++) {
    const x = randRange(rand, -lim, lim)
    const z = randRange(rand, -lim, lim)
    const c = clump.noise(x * 0.05, z * 0.05) * 0.5 + 0.5
    if (rand() > smoothstep(0.25, 0.75, c)) continue
    const g = sampleField(t, t.splat, x, z, 4, 0)
    if (g < 0.55) continue
    if (sampleField(t, t.roadDist, x, z) < 0.6) continue
    if (sampleField(t, t.slope, x, z) > 0.6) continue
    if (blocked(x, z)) continue
    const s = randRange(rand, 0.7, 1.5) * (0.6 + g * 0.5)
    pos.set(x, sampleHeight(t, x, z) - 0.02, z)
    quat.setFromAxisAngle(up, rand() * Math.PI * 2)
    scl.set(s, s * randRange(rand, 0.8, 1.3), s)
    m.compose(pos, quat, scl)
    const cx = Math.min(per - 1, Math.floor((x + WORLD.half) / GRASS_CHUNK))
    const cz = Math.min(per - 1, Math.floor((z + WORLD.half) / GRASS_CHUNK))
    const bucket = buckets[cz * per + cx]
    for (let i = 0; i < 16; i++) bucket.push(m.elements[i])
    placed++
  }
  const chunks: GrassChunk[] = []
  for (let cz = 0; cz < per; cz++) {
    for (let cx = 0; cx < per; cx++) {
      const b = buckets[cz * per + cx]
      if (!b.length) continue
      chunks.push({
        matrices: new Float32Array(b),
        count: b.length / 16,
        cx: -WORLD.half + (cx + 0.5) * GRASS_CHUNK,
        cz: -WORLD.half + (cz + 0.5) * GRASS_CHUNK,
        radius: GRASS_CHUNK * 0.75,
      })
    }
  }
  return chunks
}

/** Fallen logs: across the trails as step obstacles, plus some in the forest. */
function placeLogs(t: TerrainData, shape: TerrainShape, roads: Road[], rand: Rand, blocked: (x: number, z: number) => boolean): LogInstance[] {
  const logs: LogInstance[] = []
  const across = (roadId: string, fracs: number[]) => {
    const r = roads.find((rd) => rd.def.id === roadId)
    if (!r) return
    for (const f of fracs) {
      const i = Math.min(r.n - 2, Math.max(1, Math.floor(f * r.n)))
      const x = r.pts[i * 2]
      const z = r.pts[i * 2 + 1]
      if (blocked(x, z)) continue
      const dir = Math.atan2(r.pts[(i + 1) * 2] - x, r.pts[(i + 1) * 2 + 1] - z)
      const radius = randRange(rand, 0.2, 0.3)
      logs.push({
        x: x + randRange(rand, -0.8, 0.8), z: z + randRange(rand, -0.8, 0.8),
        y: sampleHeight(t, x, z) + radius * 0.55,
        yaw: dir + Math.PI / 2 + randRange(rand, -0.35, 0.35),
        length: r.def.halfWidth * 2 + randRange(rand, 1.5, 3.5),
        radius,
      })
    }
  }
  across('valley', [0.08, 0.14, 0.21, 0.27, 0.38, 0.46, 0.52, 0.66, 0.74, 0.86, 0.93])
  across('rocky', [0.12, 0.34, 0.62, 0.8])
  across('summit', [0.2, 0.3, 0.5, 0.7, 0.85])
  across('loop', [0.55, 0.72])
  across('forest', [0.05, 0.12, 0.2, 0.27, 0.36, 0.44, 0.52, 0.6, 0.69, 0.77, 0.85, 0.93])
  const lim = WORLD.boundary - 10
  for (let trial = 0; trial < 3000 && logs.length < 90; trial++) {
    const x = randRange(rand, -lim, lim)
    const z = randRange(rand, -lim, lim)
    if (shape.forestDensity(x, z) < 0.55) continue
    if (sampleField(t, t.roadDist, x, z) < 4 || sampleField(t, t.slope, x, z) > 0.45 || blocked(x, z)) continue
    const radius = randRange(rand, 0.18, 0.34)
    logs.push({ x, z, y: sampleHeight(t, x, z) + radius * 0.5, yaw: rand() * Math.PI, length: randRange(rand, 3, 7), radius })
  }
  return logs
}
