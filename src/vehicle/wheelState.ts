import { Vector3 } from 'three'
import { VEHICLE, type WheelConfig } from './vehicleConfig'

/** Per-wheel simulation state, written by the physics step and read by visuals. */
export interface WheelState {
  cfg: WheelConfig
  /** suspension top mount in body space */
  anchorLocal: Vector3
  grounded: boolean
  /** current suspension length (mount → wheel centre), clamped to [0, rest] */
  length: number
  /** unclamped length (negative = wheel pushed above the mount → bump stop) */
  rawLength: number
  prevLength: number
  compression: number
  /** suspension force along the body up axis (N) */
  force: number
  contactPoint: Vector3
  contactNormal: Vector3
  colliderHandle: number
  surfaceMu: number
  surfaceRolling: number
  surfaceMud: number
  /** steering angle of this wheel (rad, + = left) */
  steerAngle: number
  /** wheel angular velocity (rad/s, + = rolling forward) */
  omega: number
  /** accumulated rotation for visuals */
  spinAngle: number
  /** extra angular velocity from wheelspin */
  spinExtra: number
  driveTorque: number
  /** 0..1 – how much the tyre is sliding (audio / effects) */
  slip: number
  locked: boolean
}

export function createWheelState(cfg: WheelConfig): WheelState {
  const rest = VEHICLE.suspension.restLength
  return {
    cfg,
    anchorLocal: new Vector3(cfg.x, VEHICLE.suspension.anchorY, cfg.z),
    grounded: false,
    length: rest,
    rawLength: rest,
    prevLength: rest,
    compression: 0,
    force: 0,
    contactPoint: new Vector3(),
    contactNormal: new Vector3(0, 1, 0),
    colliderHandle: -1,
    surfaceMu: 0.9,
    surfaceRolling: 0.015,
    surfaceMud: 0,
    steerAngle: 0,
    omega: 0,
    spinAngle: 0,
    spinExtra: 0,
    driveTorque: 0,
    slip: 0,
    locked: false,
  }
}

export function resetWheelState(w: WheelState) {
  const rest = VEHICLE.suspension.restLength
  w.grounded = false
  w.length = w.rawLength = w.prevLength = rest
  w.compression = 0
  w.force = 0
  w.omega = 0
  w.spinExtra = 0
  w.driveTorque = 0
  w.slip = 0
  w.locked = false
}
