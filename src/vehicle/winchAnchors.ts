import { getWorld } from '../environment/worldState'
import type { WorldData } from '../environment/worldGen'
import type { WinchAnchor } from '../game/runtime'

const CELL = 20
type Anchor = [x: number, y: number, z: number, kind: 0 | 1]

let cache: { world: WorldData; cells: Map<number, Anchor[]> } | null = null

const key = (cx: number, cz: number) => (cx + 500) * 1000 + (cz + 500)

/** Trees and large boulders, bucketed in a 20 m grid. */
function anchors() {
  const world = getWorld()
  if (cache?.world === world) return cache.cells
  const cells = new Map<number, Anchor[]>()
  const add = (a: Anchor) => {
    const k = key(Math.floor(a[0] / CELL), Math.floor(a[2] / CELL))
    const list = cells.get(k)
    if (list) list.push(a)
    else cells.set(k, [a])
  }
  for (const t of world.trees) add([t.x, t.y + 0.9, t.z, 0])
  for (const r of world.rocks) if (Math.min(r.sx, r.sz) > 1.05) add([r.x, r.y + r.sy * 0.55, r.z, 1])
  cache = { world, cells }
  return cells
}

/**
 * Best winch anchor in front of the truck: within reach, inside a ±75° cone
 * around the heading, preferring close anchors straight ahead.
 */
export function findAnchor(hx: number, hy: number, hz: number, fx: number, fz: number, maxReach: number): WinchAnchor | null {
  const cells = anchors()
  const fl = Math.hypot(fx, fz) || 1
  const dx0 = fx / fl
  const dz0 = fz / fl
  let best: WinchAnchor | null = null
  let bestScore = Infinity
  const r = Math.ceil(maxReach / CELL)
  const cx = Math.floor(hx / CELL)
  const cz = Math.floor(hz / CELL)
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const list = cells.get(key(cx + i, cz + j))
      if (!list) continue
      for (const a of list) {
        const dx = a[0] - hx
        const dz = a[2] - hz
        const d = Math.hypot(dx, dz)
        if (d < 2.5 || d > maxReach) continue
        const cos = (dx * dx0 + dz * dz0) / d
        if (cos < 0.26) continue // outside ±75°
        const dist = Math.hypot(d, a[1] - hy)
        const score = dist * (2 - cos)
        if (score < bestScore) {
          bestScore = score
          best = { x: a[0], y: a[1], z: a[2], kind: a[3] === 0 ? 'tree' : 'rock', dist }
        }
      }
    }
  }
  return best
}
