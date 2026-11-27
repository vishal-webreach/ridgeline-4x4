import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, Vector3 } from 'three'
import { VEHICLE } from './vehicleConfig'
import { truckMaterials as M } from './materials'
import { createSuspensionGeometries } from './truckGeometry'
import { WheelMesh } from './WheelMesh'
import type { VehicleController } from './VehicleController'

const UP = new Vector3(0, 1, 0)
const _dir = new Vector3()

/** Positions a Y-aligned unit mesh between two points. */
function placeBetween(obj: Mesh | null, a: Vector3, b: Vector3, radius: number) {
  if (!obj) return
  _dir.subVectors(b, a)
  const len = _dir.length()
  if (len < 1e-5) return
  obj.position.addVectors(a, b).multiplyScalar(0.5)
  obj.quaternion.setFromUnitVectors(UP, _dir.divideScalar(len))
  obj.scale.set(radius, len, radius)
}

type MeshRefs = React.RefObject<(Mesh | null)[]>
const setRef = (refs: MeshRefs, i: number) => (m: Mesh | null) => {
  refs.current[i] = m
}

/**
 * Visual wheels and suspension, driven every frame from the physics wheel
 * state: suspension length → wheel height, steering angle, spin angle, and
 * the solid axles / coilovers / links follow the wheel hubs.
 */
export function RunningGear({ controller }: { controller: VehicleController }) {
  const geo = useMemo(() => createSuspensionGeometries(), [])
  const wheelPos = useRef<(Group | null)[]>([])
  const wheelSteer = useRef<(Group | null)[]>([])
  const wheelSpin = useRef<(Group | null)[]>([])
  const axles = useRef<(Mesh | null)[]>([])
  const pumpkins = useRef<(Mesh | null)[]>([])
  const shockBodies = useRef<(Mesh | null)[]>([])
  const shafts = useRef<(Mesh | null)[]>([])
  const springs = useRef<(Mesh | null)[]>([])
  const links = useRef<(Mesh | null)[]>([])
  const driveshafts = useRef<(Mesh | null)[]>([])

  const tmp = useMemo(() => ({ a: new Vector3(), b: new Vector3(), c: new Vector3() }), [])
  const anchorY = VEHICLE.suspension.anchorY

  useFrame(() => {
    const ws = controller.wheels
    ws.forEach((w, i) => {
      const g = wheelPos.current[i]
      if (g) g.position.set(w.cfg.x, anchorY - w.length, w.cfg.z)
      const s = wheelSteer.current[i]
      if (s) s.rotation.y = w.steerAngle
      const sp = wheelSpin.current[i]
      if (sp) sp.rotation.x = w.spinAngle
    })

    // two solid axles: 0 = front (wheels 0, 1), 1 = rear (wheels 2, 3)
    for (let axle = 0; axle < 2; axle++) {
      const L = ws[axle * 2]
      const Rw = ws[axle * 2 + 1]
      const z = L.cfg.z
      const xL = L.cfg.x
      const xR = Rw.cfg.x
      const yL = anchorY - L.length
      const yR = anchorY - Rw.length
      const yAt = (x: number) => yR + ((yL - yR) * (x - xR)) / (xL - xR)

      tmp.a.set(xL - 0.17, yL, z)
      tmp.b.set(xR + 0.17, yR, z)
      placeBetween(axles.current[axle], tmp.a, tmp.b, 0.055)
      const p = pumpkins.current[axle]
      if (p) {
        p.position.set(0.12, yAt(0.12), z + (axle === 0 ? -0.05 : 0.05))
        p.rotation.set(0, 0, Math.atan2(yL - yR, xL - xR))
      }

      for (let side = 0; side < 2; side++) {
        const idx = axle * 2 + side
        const sx = side === 0 ? 1 : -1
        const lean = axle === 0 ? -0.1 : 0.1
        // coilover: chassis mount above → axle perch
        const top = tmp.a.set(sx * 0.62, 0.44, z + lean)
        const bottom = tmp.b.set(sx * 0.62, yAt(sx * 0.62) + 0.06, z)
        placeBetween(shafts.current[idx], bottom, top, 0.018)
        tmp.c.subVectors(bottom, top).normalize().multiplyScalar(0.36).add(top)
        placeBetween(shockBodies.current[idx], top, tmp.c, 0.045)
        const sp = springs.current[idx]
        if (sp) {
          tmp.c.subVectors(bottom, top)
          const len = tmp.c.length()
          sp.position.addVectors(top, bottom).multiplyScalar(0.5)
          sp.quaternion.setFromUnitVectors(UP, tmp.c.divideScalar(len))
          sp.scale.set(1, len * 0.82, 1)
        }
        // trailing link from the frame to the axle
        const toward = axle === 0 ? -1 : 1
        tmp.a.set(sx * 0.42, -0.06, z + toward * 0.95)
        tmp.b.set(sx * 0.42, yAt(sx * 0.42) - 0.04, z)
        placeBetween(links.current[idx], tmp.a, tmp.b, 0.035)
      }

      // driveshaft from the transfer case to the differential
      tmp.a.set(0.12, -0.08, axle === 0 ? 0.55 : 0.1)
      tmp.b.set(0.12, yAt(0.12), z + (axle === 0 ? -0.2 : 0.2))
      placeBetween(driveshafts.current[axle], tmp.a, tmp.b, 0.04)
    }
  })

  return (
    <group>
      {VEHICLE.wheels.map((w, i) => (
        <group key={w.id} ref={(g) => { wheelPos.current[i] = g }} position={[w.x, anchorY - VEHICLE.suspension.restLength * 0.65, w.z]}>
          <group ref={(g) => { wheelSteer.current[i] = g }}>
            <group ref={(g) => { wheelSpin.current[i] = g }}>
              <group rotation={[0, w.left ? 0 : Math.PI, 0]}>
                <WheelMesh />
              </group>
            </group>
          </group>
        </group>
      ))}
      {[0, 1].map((i) => (
        <mesh key={`axle${i}`} ref={setRef(axles, i)} geometry={geo.unitCylinder} material={M.frame} castShadow />
      ))}
      {[0, 1].map((i) => (
        <mesh key={`diff${i}`} ref={setRef(pumpkins, i)} geometry={geo.pumpkin} material={M.frame} castShadow />
      ))}
      {[0, 1].map((i) => (
        <mesh key={`ds${i}`} ref={setRef(driveshafts, i)} geometry={geo.unitCylinder} material={M.steel} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <group key={`coil${i}`}>
          <mesh ref={setRef(shockBodies, i)} geometry={geo.unitCylinder} material={M.shock} castShadow />
          <mesh ref={setRef(shafts, i)} geometry={geo.unitCylinder} material={M.shockShaft} />
          <mesh ref={setRef(springs, i)} geometry={geo.spring} material={M.spring} />
          <mesh ref={setRef(links, i)} geometry={geo.unitCylinder} material={M.steel} castShadow />
        </group>
      ))}
    </group>
  )
}
