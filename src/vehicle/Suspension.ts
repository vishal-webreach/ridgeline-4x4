import { Vector3 } from 'three'
import type { Ray, RigidBody, World } from '@dimforge/rapier3d-compat'
import { VEHICLE } from './vehicleConfig'
import type { WheelState } from './wheelState'
import { surfaceAt, type SurfaceSample } from '../physics/surfaces'
import { telemetry } from '../game/runtime'

const S = VEHICLE.suspension

const _origin = new Vector3()
const _surface: SurfaceSample = { mu: 0.9, rolling: 0.015, mud: 0 }

/**
 * Casts a small fan of parallel rays along the tyre's footprint. Each ray hit
 * is converted into the suspension length at which the round tyre would touch
 * that point; the shortest length wins. This lets the wheel roll up onto rock
 * edges instead of a single ray dropping into gaps.
 */
export function castSuspension(
  world: World,
  ray: Ray,
  body: RigidBody,
  filterFlags: number,
  wheel: WheelState,
  anchor: Vector3,
  down: Vector3,
  wheelForward: Vector3,
  dt: number,
) {
  const R = VEHICLE.wheelRadius
  let best = Infinity
  const maxToi = S.restLength + R
  for (const k of S.rayOffsets) {
    const s = k * R
    _origin.copy(anchor).addScaledVector(wheelForward, s)
    ray.origin.x = _origin.x
    ray.origin.y = _origin.y
    ray.origin.z = _origin.z
    ray.dir.x = down.x
    ray.dir.y = down.y
    ray.dir.z = down.z
    const hit = world.castRayAndGetNormal(ray, maxToi, true, filterFlags, undefined, undefined, body)
    if (!hit) continue
    const len = hit.timeOfImpact - Math.sqrt(R * R - s * s)
    if (len < best) {
      best = len
      wheel.contactPoint.copy(_origin).addScaledVector(down, hit.timeOfImpact)
      wheel.contactNormal.set(hit.normal.x, hit.normal.y, hit.normal.z)
      wheel.colliderHandle = hit.collider.handle
    }
  }

  wheel.prevLength = wheel.length
  if (best <= S.restLength) {
    // make sure the normal faces the chassis
    if (wheel.contactNormal.dot(down) > 0) wheel.contactNormal.negate()
    if (wheel.contactNormal.lengthSq() < 1e-6) wheel.contactNormal.copy(down).negate()
    wheel.grounded = true
    wheel.rawLength = best
    wheel.length = Math.max(0, best)
    const tp = VEHICLE.tirePressure
    const p01 = (telemetry.tirePressure - tp.min) / (tp.max - tp.min)
    surfaceAt(wheel.colliderHandle, wheel.contactPoint.x, wheel.contactPoint.z, p01, _surface)
    wheel.surfaceMu = _surface.mu
    wheel.surfaceRolling = _surface.rolling
    wheel.surfaceMud = _surface.mud
  } else {
    // airborne: the spring extends the wheel back to full droop
    wheel.grounded = false
    wheel.rawLength = S.restLength
    wheel.length += (S.restLength - wheel.length) * Math.min(1, dt * 18)
    wheel.colliderHandle = -1
  }
  wheel.compression = S.restLength - wheel.length
}

/** Spring + velocity-dependent damper + progressive bump stop. Returns N (≥ 0). */
export function suspensionForce(wheel: WheelState, dt: number): number {
  if (!wheel.grounded) return 0
  const compression = S.restLength - wheel.length
  const velocity = Math.max(-6, Math.min(6, (wheel.prevLength - wheel.length) / dt)) // + = compressing
  const damping = velocity > 0 ? S.bumpDamping : S.reboundDamping
  let f = S.stiffness * compression + damping * velocity
  if (wheel.rawLength < S.bumpStopLength) {
    const into = S.bumpStopLength - wheel.rawLength
    f += S.bumpStopStiffness * into + into * into * S.bumpStopStiffness * 4
  }
  return Math.max(0, Math.min(S.maxForce, f))
}
