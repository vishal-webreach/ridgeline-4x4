import { useEffect, useMemo } from 'react'
import {
  BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, Quaternion, Vector3, type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { RockInstance } from './worldGen'
import { getRockGeometry, getRockHullPoints } from './propGeometry'
import { useStaticColliders } from '../physics/useStaticColliders'
import { Surface, WORLD } from './worldConfig'
import { mulberry32 } from './noise'

const ROCK_CHUNK = 160

/**
 * Boulders, baked into one static mesh per 160 m chunk (≈16 draw calls for
 * ~600 rocks, culled by the camera and the shadow camera), plus a convex-hull
 * collider per rock built from the same shape.
 */
export function Rocks({ rocks, texture, shadows, detail, cheap }: { rocks: RockInstance[]; texture: Texture; shadows: boolean; detail: 1 | 2; cheap: boolean }) {
  const meshes = useMemo(() => {
    const material = cheap
      ? new MeshLambertMaterial({ map: texture, vertexColors: true })
      : new MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0, vertexColors: true })
    const m = new Matrix4()
    const p = new Vector3()
    const q = new Quaternion()
    const s = new Vector3()
    const rand = mulberry32(55)
    const per = Math.ceil(WORLD.size / ROCK_CHUNK)
    const chunks: BufferGeometry[][] = Array.from({ length: per * per }, () => [])
    for (const r of rocks) {
      const g = getRockGeometry(r.variant, detail).clone()
      m.compose(p.set(r.x, r.y, r.z), q.set(r.q[0], r.q[1], r.q[2], r.q[3]), s.set(r.sx, r.sy, r.sz))
      g.applyMatrix4(m)
      const k = 0.75 + rand() * 0.35
      const tint = [k * (1 + rand() * 0.08), k, k * (0.92 + rand() * 0.06)]
      const count = g.getAttribute('position').count
      const colors = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) colors.set(tint, i * 3)
      g.setAttribute('color', new Float32BufferAttribute(colors, 3))
      const cx = Math.min(per - 1, Math.max(0, Math.floor((r.x + WORLD.half) / ROCK_CHUNK)))
      const cz = Math.min(per - 1, Math.max(0, Math.floor((r.z + WORLD.half) / ROCK_CHUNK)))
      chunks[cz * per + cx].push(g)
    }
    return chunks
      .filter((list) => list.length)
      .map((list) => {
        const geo = mergeGeometries(list)!
        list.forEach((g) => g.dispose())
        geo.computeBoundingSphere()
        const mesh = new Mesh(geo, material)
        mesh.castShadow = shadows
        mesh.receiveShadow = true
        mesh.matrixAutoUpdate = false
        return mesh
      })
  }, [rocks, texture, shadows, detail, cheap])

  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes])

  useStaticColliders(
    (rapier) => {
      const p = new Vector3()
      const q = new Quaternion()
      const specs = []
      for (const r of rocks) {
        const base = getRockHullPoints(r.variant)
        const pts = new Float32Array(base.length)
        q.set(r.q[0], r.q[1], r.q[2], r.q[3])
        for (let i = 0; i < base.length; i += 3) {
          p.set(base[i] * r.sx, base[i + 1] * r.sy, base[i + 2] * r.sz).applyQuaternion(q)
          pts[i] = p.x
          pts[i + 1] = p.y
          pts[i + 2] = p.z
        }
        const desc = rapier.ColliderDesc.convexHull(pts)
        if (!desc) continue
        desc.setTranslation(r.x, r.y, r.z).setFriction(1.0)
        specs.push({ desc, surface: Surface.Rock })
      }
      return specs
    },
    [rocks],
  )

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}
