import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, Matrix4, MeshBasicMaterial, PlaneGeometry, Vector3, type Mesh } from 'three'
import { vehicleRefs } from './vehicleRefs'
import { getWorld } from '../environment/worldState'
import { sampleHeight } from '../environment/terrainGenerator'

/**
 * Cheap contact shadow for devices without real-time shadows: a soft dark
 * ellipse laid on the terrain under the truck, fading as it leaves the ground.
 */
export function BlobShadow({ length, width }: { length: number; width: number }) {
  const mesh = useRef<Mesh>(null)
  const { geometry, material } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,0.75)')
    g.addColorStop(0.6, 'rgba(0,0,0,0.45)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    const geometry = new PlaneGeometry(width * 1.35, length * 1.2)
    geometry.rotateX(-Math.PI / 2)
    const material = new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
    return { geometry, material }
  }, [length, width])
  const v = useMemo(() => ({ p: new Vector3(), f: new Vector3(), n: new Vector3(), x: new Vector3(), z: new Vector3(), m: new Matrix4() }), [])

  useFrame(() => {
    const obj = vehicleRefs.object
    const m = mesh.current
    if (!obj || !m) return
    const t = getWorld().terrain
    obj.getWorldPosition(v.p)
    v.f.set(0, 0, 1).transformDirection(obj.matrixWorld)
    const h = sampleHeight(t, v.p.x, v.p.z)
    const e = 1.2
    v.n.set(sampleHeight(t, v.p.x - e, v.p.z) - sampleHeight(t, v.p.x + e, v.p.z), 2 * e, sampleHeight(t, v.p.x, v.p.z - e) - sampleHeight(t, v.p.x, v.p.z + e)).normalize()
    v.z.copy(v.f).addScaledVector(v.n, -v.f.dot(v.n)).normalize()
    v.x.crossVectors(v.n, v.z)
    v.m.makeBasis(v.x, v.n, v.z)
    m.quaternion.setFromRotationMatrix(v.m)
    m.position.set(v.p.x, h + 0.05, v.p.z)
    material.opacity = Math.max(0, 1 - (v.p.y - h - 0.8) / 3)
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={1} />
}
