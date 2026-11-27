import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type SpotLight } from 'three'
import { buildTruck } from './truckGeometry'
import { materialFor, truckMaterials } from './materials'
import type { TruckSpec } from './trucks'
import { lighting } from '../game/runtime'

const NO_SHADOW = new Set(['glass', 'headlight', 'amber', 'taillight', 'lightbar', 'bedLiner'])

/**
 * Static body of the truck: merged geometry per material (≈ a dozen draw calls)
 * plus headlight spot lights that switch on at night or with the light key.
 */
export function TruckModel({ spec, headlightCount }: { spec: TruckSpec; headlightCount: 1 | 2 }) {
  const visual = useMemo(() => buildTruck(spec), [spec])
  const lights = useRef<(SpotLight | null)[]>([])
  const targets = useMemo(() => visual.headlights.map(() => new Object3D()), [visual])

  const lamps = useMemo(() => {
    const [l, r] = visual.headlights
    // with one light it sits between the headlamps
    return headlightCount === 2 ? visual.headlights : [[(l[0] + r[0]) / 2, l[1], l[2]] as [number, number, number]]
  }, [visual, headlightCount])

  useFrame(() => {
    const on = lighting.headlightsOn
    const k = on ? 1 : 0
    for (const l of lights.current) if (l) l.intensity = k * (headlightCount === 2 ? 60 : 110)
    truckMaterials.headlight.emissiveIntensity = on ? 3 : 0.6
    truckMaterials.lightbar.emissiveIntensity = on ? 2 : 0.5
    truckMaterials.taillight.emissiveIntensity = on ? 1.8 : 0.6
  })

  return (
    <group>
      {visual.parts.map(({ mat, geometry }) => (
        <mesh
          key={mat}
          geometry={geometry}
          material={materialFor(mat, spec.paint, spec.trim)}
          castShadow={!NO_SHADOW.has(mat)}
        />
      ))}
      {lamps.map((p, i) => (
        <group key={i} position={p}>
          <primitive object={targets[i] ?? targets[0]} position={[0, -1.4, 18]} />
          <spotLight
            ref={(l) => {
              lights.current[i] = l
            }}
            target={targets[i] ?? targets[0]}
            color="#fff3dc"
            intensity={0}
            angle={0.55}
            penumbra={0.55}
            distance={70}
            decay={1.4}
          />
        </group>
      ))}
    </group>
  )
}
