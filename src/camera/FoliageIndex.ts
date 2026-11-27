import type { Vector3 } from 'three'
import type { TreeInstance } from '../environment/worldGen'

/**
 * Spatial grid of tree crowns (approximated as vertical cylinders). Tree
 * foliage has no physics collider, so the camera tests its line of sight
 * against this index to avoid ending up inside a canopy.
 */
export class FoliageIndex {
  private cells = new Map<number, number[]>()
  private readonly size = 16

  constructor(private trees: TreeInstance[]) {
    trees.forEach((t, i) => {
      const k = this.key(Math.floor(t.x / this.size), Math.floor(t.z / this.size))
      const list = this.cells.get(k)
      if (list) list.push(i)
      else this.cells.set(k, [i])
    })
  }

  private key(cx: number, cz: number) {
    return (cx + 1000) * 4000 + (cz + 1000)
  }

  /** Distance along the ray at which it first enters a crown (or maxDist if clear). */
  clip(o: Vector3, d: Vector3, maxDist: number): number {
    let best = maxDist
    const ex = o.x + d.x * maxDist
    const ez = o.z + d.z * maxDist
    const pad = 4
    const x0 = Math.floor((Math.min(o.x, ex) - pad) / this.size)
    const x1 = Math.floor((Math.max(o.x, ex) + pad) / this.size)
    const z0 = Math.floor((Math.min(o.z, ez) - pad) / this.size)
    const z1 = Math.floor((Math.max(o.z, ez) + pad) / this.size)
    const a = d.x * d.x + d.z * d.z
    if (a < 1e-6) return best
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz))
        if (!list) continue
        for (const i of list) {
          const t = this.trees[i]
          const r = (t.species === 0 ? 1.6 : 2.1) * t.scale
          const fx = o.x - t.x
          const fz = o.z - t.z
          const c = fx * fx + fz * fz - r * r
          if (c < 0) continue // the truck itself is under this tree – ignore it
          const b = 2 * (fx * d.x + fz * d.z)
          const disc = b * b - 4 * a * c
          if (disc < 0) continue
          const hit = (-b - Math.sqrt(disc)) / (2 * a)
          if (hit < 0 || hit >= best) continue
          const y = o.y + d.y * hit
          if (y > t.y + 2.2 * t.scale && y < t.y + 9 * t.scale) best = hit
        }
      }
    }
    return best
  }
}
