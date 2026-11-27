import { buildRoadCurves, sampleHeight, type Road, type TerrainData } from '../environment/terrainGenerator'
import type { Checkpoint, WeatherType } from './runtime'

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Extreme'

/** A piece of route: follow a road between the samples nearest two points, or go straight through points. */
type RouteSegment =
  | { road: string; from: [number, number]; to: [number, number]; dir?: 1 | -1 }
  | { points: [number, number][] }

export interface StageDef {
  id: string
  name: string
  region: string
  description: string
  difficulty: Difficulty
  /** time of day at the start (hours) */
  startHour: number
  /** null = free roam */
  route: RouteSegment[] | null
  /** recommended tyre pressure (psi) */
  psi: number
  tags: string[]
  weather: WeatherType
}

export const STAGES: StageDef[] = [
  {
    id: 'basecamp',
    name: 'Base Camp Loop',
    region: 'Learn to drive',
    description: 'Gentle dirt road out of camp. Get a feel for the throttle, brakes, 4WD and the gauges.',
    difficulty: 'Easy',
    startHour: 10,
    route: [{ road: 'loop', from: [-112, -166], to: [190, 80], dir: 1 }],
    psi: 30,
    tags: ['Tutorial', 'Dirt road'],
    weather: 'clear',
  },
  {
    id: 'valley',
    name: 'Valley Traverse',
    region: 'Whoops · mud bog · gully',
    description: 'Cross the valley north–south: twist the axles through the whoops, wade the mud bog and dip through the gully.',
    difficulty: 'Medium',
    startHour: 7.2,
    route: [
      { road: 'loop', from: [-112, -166], to: [0, -182], dir: 1 },
      { road: 'valley', from: [0, -176], to: [12, 186] },
      { road: 'loop', from: [5, 190], to: [-130, 170], dir: 1 },
    ],
    psi: 16,
    tags: ['Mud', 'Articulation', 'Rain'],
    weather: 'rain',
  },
  {
    id: 'boulder',
    name: 'Boulder Run',
    region: 'Rock garden · hill climb',
    description: 'Pick a line through the rock garden, follow the rocky trail and finish on top of the steep hill. Low range recommended.',
    difficulty: 'Hard',
    startHour: 5.6,
    route: [
      { road: 'loop', from: [-205, -50], to: [-200, 70], dir: -1 },
      { road: 'rocky', from: [-198, 70], to: [65, -80] },
      { points: [[65, -80], [80, -76], [96, -73], [112, -72]] },
    ],
    psi: 14,
    tags: ['Rocks', 'Hill climb', 'Dawn fog'],
    weather: 'fog',
  },
  {
    id: 'ridge',
    name: 'Ridge Summit',
    region: 'Switchbacks · cliff cuttings',
    description: 'Climb the switchbacks to the ridge-top flag as the sun goes down. Narrow, steep and unforgiving.',
    difficulty: 'Hard',
    startHour: 17.4,
    route: [
      { road: 'loop', from: [170, -150], to: [130, 175], dir: 1 },
      { road: 'summit', from: [128, 172], to: [228, 252] },
    ],
    psi: 18,
    tags: ['Steep', 'Dusk'],
    weather: 'clear',
  },
  {
    id: 'nightcrawl',
    name: 'Night Crawl',
    region: 'Rocky trail in the dark',
    description: 'The rocky trail backwards, by headlight. Slow is smooth, smooth is fast.',
    difficulty: 'Extreme',
    startHour: 21.5,
    route: [
      { road: 'rocky', from: [65, -80], to: [-198, 70] },
      { road: 'loop', from: [-200, 70], to: [-130, 170], dir: -1 },
    ],
    psi: 12,
    tags: ['Night', 'Rocks', 'Fog'],
    weather: 'fog',
  },
  {
    id: 'forest',
    name: 'Forest Track',
    region: 'Roots · logs · mud · rain',
    description: 'A narrow, rutted track through the woods. Logs across the trail, stones everywhere and two mud holes. Winch out if you bog down.',
    difficulty: 'Hard',
    startHour: 15.5,
    route: [{ road: 'forest', from: [-204, -48], to: [-21, -110] }],
    psi: 12,
    tags: ['Logs', 'Mud', 'Rain'],
    weather: 'rain',
  },
  {
    id: 'storm',
    name: 'Midnight Storm',
    region: 'Forest track at night, in a thunderstorm',
    description: 'The forest track backwards at midnight in a lightning storm. Headlights on, tyres down, winch ready.',
    difficulty: 'Extreme',
    startHour: 23.5,
    route: [{ road: 'forest', from: [-21, -110], to: [-204, -48] }],
    psi: 10,
    tags: ['Night', 'Storm', 'Mud'],
    weather: 'storm',
  },
  {
    id: 'free',
    name: 'Free Roam',
    region: 'Whole valley',
    description: 'No clock, no checkpoints. Explore every trail, climb the hill, chase the sunset.',
    difficulty: 'Easy',
    startHour: 8,
    route: null,
    psi: 26,
    tags: ['Explore', 'Day/night'],
    weather: 'clear',
  },
  {
    id: 'custom',
    name: 'Custom Roam',
    region: 'Your rules',
    description: 'Free driving with your own setup: start point, time of day, clock speed, weather, fuel and damage.',
    difficulty: 'Easy',
    startHour: 12,
    route: null,
    psi: 26,
    tags: ['Custom'],
    weather: 'clear',
  },
]

/** Start points for Custom Roam. */
export interface RoamStart {
  id: string
  name: string
  /** either a road + fraction along it, or a point and a point to face */
  road?: string
  frac?: number
  at?: [number, number]
  face?: [number, number]
}

export const ROAM_STARTS: RoamStart[] = [
  { id: 'basecamp', name: 'Base Camp' },
  { id: 'forest', name: 'Forest Track', road: 'forest', frac: 0.02 },
  { id: 'mudbog', name: 'Valley Mud Bog', at: [-14, -96], face: [8, -30] },
  { id: 'rockgarden', name: 'Rock Garden', at: [-140, 62], face: [-100, 60] },
  { id: 'hill', name: 'Hill Climb', at: [62, -73], face: [115, -72] },
  { id: 'ridge', name: 'Ridge Summit', road: 'summit', frac: 0.96 },
]

/** World position + heading of a roam start point. */
export function roamStartPlacement(roads: Road[], start: RoamStart, spawn: { x: number; z: number; yaw: number }) {
  if (start.road) {
    const r = roads.find((rd) => rd.def.id === start.road)
    if (r) {
      const i = Math.min(r.n - 2, Math.max(0, Math.floor((start.frac ?? 0) * (r.n - 1))))
      const x = r.pts[i * 2]
      const z = r.pts[i * 2 + 1]
      const a = Math.max(0, i - 1)
      const b = Math.min(r.n - 1, i + 1)
      let yaw = Math.atan2(r.pts[b * 2] - r.pts[a * 2], r.pts[b * 2 + 1] - r.pts[a * 2 + 1])
      if ((start.frac ?? 0) > 0.5) yaw += Math.PI // at the end of a road: face back down it
      return { x, z, yaw }
    }
  }
  if (start.at && start.face) {
    return { x: start.at[0], z: start.at[1], yaw: Math.atan2(start.face[0] - start.at[0], start.face[1] - start.at[1]) }
  }
  return spawn
}

export const getStage = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0]

function nearestIndex(road: Road, x: number, z: number) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < road.n; i++) {
    const d = (road.pts[i * 2] - x) ** 2 + (road.pts[i * 2 + 1] - z) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

export interface Route {
  pts: Float32Array
  cum: Float32Array
  total: number
}

/** Concatenates the stage's road segments into one polyline with cumulative distances. */
export function buildRoute(roads: Road[], stage: StageDef): Route | null {
  if (!stage.route) return null
  const out: number[] = []
  const push = (x: number, z: number) => {
    const n = out.length
    if (n >= 2 && Math.hypot(out[n - 2] - x, out[n - 1] - z) < 0.5) return
    out.push(x, z)
  }
  for (const seg of stage.route) {
    if ('points' in seg) {
      for (const [x, z] of seg.points) push(x, z)
      continue
    }
    const road = roads.find((r) => r.def.id === seg.road)
    if (!road) continue
    const i0 = nearestIndex(road, seg.from[0], seg.from[1])
    const i1 = nearestIndex(road, seg.to[0], seg.to[1])
    const dir = road.def.closed ? (seg.dir ?? 1) : i1 >= i0 ? 1 : -1
    let i = i0
    for (let guard = 0; guard <= road.n; guard++) {
      push(road.pts[i * 2], road.pts[i * 2 + 1])
      if (i === i1) break
      i = road.def.closed ? (i + dir + road.n) % road.n : i + dir
    }
  }
  const n = out.length / 2
  const pts = new Float32Array(out)
  const cum = new Float32Array(n)
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1])
  return { pts, cum, total: cum[n - 1] }
}

let menuRoads: Road[] | null = null

/** Route length for the menu, before the world (terrain) exists. */
export function stageLengthKm(stage: StageDef): number | null {
  menuRoads ??= buildRoadCurves()
  const r = buildRoute(menuRoads, stage)
  return r ? r.total / 1000 : null
}

/** Checkpoint gates every ~140 m along the route, plus the finish line. */
export function makeCheckpoints(route: Route, terrain: TerrainData): Checkpoint[] {
  const out: Checkpoint[] = []
  const count = Math.max(2, Math.round(route.total / 140))
  const n = route.cum.length
  let j = 0
  for (let k = 1; k <= count; k++) {
    const at = (route.total * k) / count
    while (j < n - 2 && route.cum[j + 1] < at) j++
    const i = k === count ? n - 1 : j
    const x = route.pts[i * 2]
    const z = route.pts[i * 2 + 1]
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    const yaw = Math.atan2(route.pts[b * 2] - route.pts[a * 2], route.pts[b * 2 + 1] - route.pts[a * 2 + 1])
    out.push({ x, z, y: sampleHeight(terrain, x, z), yaw, at: route.cum[i] })
  }
  return out
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

const BEST_KEY = 'ridgeline.best'

export function loadBestTimes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

export function saveBestTime(stageId: string, time: number) {
  const all = loadBestTimes()
  if (all[stageId] === undefined || time < all[stageId]) {
    all[stageId] = time
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all))
    } catch {
      // storage unavailable (private mode) – ignore
    }
    return true
  }
  return false
}
