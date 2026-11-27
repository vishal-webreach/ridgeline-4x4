import type { Object3D } from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import type { VehicleController } from './VehicleController'

/** Handles to the live vehicle for systems outside the vehicle tree (camera, lights, audio). */
export const vehicleRefs: {
  body: RapierRigidBody | null
  /** interpolated visual root of the chassis */
  object: Object3D | null
  controller: VehicleController | null
} = {
  body: null,
  object: null,
  controller: null,
}
