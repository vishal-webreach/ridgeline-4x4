import { createWheelGeometries } from './truckGeometry'
import { truckMaterials as M } from './materials'
import { VEHICLE } from './vehicleConfig'

/** One tyre + rim of the active truck. Axis = X, outer face = +X. Geometry is shared. */
export function WheelMesh() {
  const g = createWheelGeometries(VEHICLE.wheelRadius, VEHICLE.wheelWidth)
  return (
    <group>
      <mesh geometry={g.tire} material={M.tire} castShadow />
      <mesh geometry={g.rim} material={M.rim} />
      <mesh geometry={g.accent} material={M.rimAccent} />
    </group>
  )
}
