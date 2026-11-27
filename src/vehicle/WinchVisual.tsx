import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, CylinderGeometry, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, Quaternion, TorusGeometry, Vector3, type Mesh } from 'three'
import { winch } from '../game/runtime'

const UP = new Vector3(0, 1, 0)

/**
 * Winch cable from the fairlead to the anchor (sagging when slack, glowing
 * when under heavy load), a tree-strap ring at the anchor, and a floating
 * marker over the best anchor in reach while not hooked up.
 */
export function WinchVisual() {
  const cable = useRef<Mesh>(null)
  const strap = useRef<Mesh>(null)
  const marker = useRef<Mesh>(null)
  const v = useMemo(() => ({ a: new Vector3(), b: new Vector3(), d: new Vector3(), q: new Quaternion() }), [])
  const res = useMemo(() => {
    const cableMat = new MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6, metalness: 0.6, emissive: new Color('#ff6a1a'), emissiveIntensity: 0 })
    return {
      cableGeo: new CylinderGeometry(0.018, 0.018, 1, 6),
      cableMat,
      strapGeo: new TorusGeometry(0.42, 0.06, 6, 16),
      strapMat: new MeshStandardMaterial({ color: '#f07a1a', roughness: 0.7 }),
      markerGeo: new OctahedronGeometry(0.45),
      markerMat: new MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, fog: false }),
    }
  }, [])

  useFrame(({ clock }) => {
    const c = cable.current
    const s = strap.current
    const m = marker.current
    if (!c || !s || !m) return
    c.visible = s.visible = winch.attached
    if (winch.attached) {
      v.a.set(winch.hook.x, winch.hook.y, winch.hook.z)
      v.b.set(winch.anchor.x, winch.anchor.y, winch.anchor.z)
      v.d.subVectors(v.b, v.a)
      const len = v.d.length()
      // a slack cable droops at its middle
      const slack = Math.max(0, winch.length - len)
      c.position.addVectors(v.a, v.b).multiplyScalar(0.5)
      c.position.y -= Math.min(1.2, slack * 0.4)
      c.quaternion.setFromUnitVectors(UP, v.d.normalize())
      c.scale.set(1, len, 1)
      res.cableMat.emissiveIntensity = Math.min(1.5, winch.tension / 30000)
      s.position.copy(v.b)
      s.rotation.set(Math.PI / 2, 0, 0)
    }
    const cand = winch.candidate
    m.visible = !winch.attached && !!cand
    if (cand) {
      m.position.set(cand.x, cand.y + 2.4 + Math.sin(clock.elapsedTime * 3) * 0.15, cand.z)
      m.rotation.y = clock.elapsedTime * 1.5
    }
  })

  return (
    <>
      <mesh ref={cable} geometry={res.cableGeo} material={res.cableMat} visible={false} />
      <mesh ref={strap} geometry={res.strapGeo} material={res.strapMat} visible={false} />
      <mesh ref={marker} geometry={res.markerGeo} material={res.markerMat} visible={false} />
    </>
  )
}
