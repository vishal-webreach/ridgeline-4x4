import { sampleSurfaceWeights } from '../environment/terrainGenerator'
import { getWorld } from '../environment/worldState'
import { SURFACES, Surface } from '../environment/worldConfig'

/**
 * Maps Rapier collider handles to a surface type. The terrain collider is
 * special: its surface is a blend sampled from the splat map
 * (grass / dirt / rock / mud).
 */
const surfaces = new Map<number, Surface | 'terrain'>()

export function registerSurface(handle: number, value: Surface | 'terrain') {
  surfaces.set(handle, value)
}

export function unregisterSurface(handle: number) {
  surfaces.delete(handle)
}

export interface SurfaceSample {
  /** tyre friction coefficient */
  mu: number
  /** rolling resistance coefficient */
  rolling: number
  /** 0..1 mud share (audio / effects) */
  mud: number
}

const weights = [0, 0, 0, 0]

/**
 * Grip and rolling resistance under a tyre.
 * @param pressure01 tyre pressure normalised 0 (fully aired down) … 1 (road pressure)
 */
export function surfaceAt(handle: number, x: number, z: number, pressure01: number, out: SurfaceSample): SurfaceSample {
  const v = surfaces.get(handle)
  const air = 1 - pressure01
  if (v === 'terrain') {
    sampleSurfaceWeights(getWorld().terrain, x, z, weights)
    let mu = 0
    let rolling = 0
    for (let i = 0; i < 4; i++) {
      const s = SURFACES[i]
      mu += weights[i] * (s.mu + s.airDown * air)
      rolling += weights[i] * s.rolling
    }
    out.mu = mu
    out.rolling = rolling * (1 + 0.9 * air)
    out.mud = weights[3]
    return out
  }
  const s = SURFACES[v ?? Surface.Dirt]
  out.mu = s.mu + s.airDown * air
  out.rolling = s.rolling * (1 + 0.9 * air)
  out.mud = 0
  return out
}
