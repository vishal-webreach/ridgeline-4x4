import { Vector3 } from 'three'
import { VEHICLE } from './vehicleConfig'
import type { WheelState } from './wheelState'

const TIRE = VEHICLE.tire
const G = 9.81

const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0)
const clampAbs = (v: number, max: number) => Math.max(-max, Math.min(max, v))

/** Per-wheel contact data, computed before the drivetrain decides how to share torque. */
export interface Contact {
  /** rolling direction on the contact plane */
  forward: Vector3
  /** lateral direction on the contact plane (wheel's left) */
  side: Vector3
  vLong: number
  /** longitudinal / lateral velocity predicted at the end of the step (gravity included) */
  vLongP: number
  vLatP: number
  /** peak friction force μ·N */
  maxF: number
  /** sliding / spinning friction force */
  kinetic: number
  /** effective mass this wheel supports (N / g) – used for static friction */
  mEff: number
  /** brake + rolling resistance force, signed against the motion and capped so it never reverses it */
  resist: number
  /** brake force capacity at this wheel (N) */
  brakeCap: number
  rear: boolean
  /** final longitudinal force (N) */
  long: number
  /** final lateral force (N) */
  lat: number
}

export function createContact(): Contact {
  return {
    forward: new Vector3(), side: new Vector3(), vLong: 0, vLongP: 0, vLatP: 0, maxF: 0, kinetic: 0,
    mEff: 0, resist: 0, brakeCap: 0, rear: false, long: 0, lat: 0,
  }
}

export interface ContactInputs {
  dt: number
  mass: number
  brakeForce: number
  handbrake: boolean
  /** world gravity – lets static friction cancel the slope pull within this step */
  gravity: Vector3
}

/**
 * Phase 1: tyre axes on the contact plane, slip velocities, grip limit and the
 * resistive (brake + rolling) force. Velocities are predicted to the end of the
 * step so that static friction holds a parked truck on a slope without creep.
 */
export function prepareContact(w: WheelState, contactVelocity: Vector3, wheelForward: Vector3, inp: ContactInputs, c: Contact) {
  const n = w.contactNormal
  const fwd = c.forward.copy(wheelForward).addScaledVector(n, -wheelForward.dot(n))
  if (fwd.lengthSq() < 1e-8) fwd.copy(wheelForward)
  fwd.normalize()
  c.side.crossVectors(n, fwd).normalize()

  c.vLong = contactVelocity.dot(fwd)
  c.vLongP = c.vLong + inp.gravity.dot(fwd) * inp.dt
  c.vLatP = contactVelocity.dot(c.side) + inp.gravity.dot(c.side) * inp.dt
  const N = w.force
  c.maxF = w.surfaceMu * TIRE.grip * N
  c.kinetic = c.maxF * TIRE.kineticFriction
  c.mEff = Math.min(inp.mass * 0.5, Math.max(inp.mass * 0.06, N / G))
  c.rear = !w.cfg.front
  c.brakeCap = inp.brakeForce + (inp.handbrake && c.rear ? VEHICLE.brakes.handbrake : 0)
  const cancelLong = (Math.abs(c.vLongP) * c.mEff) / inp.dt
  c.resist = -sign(c.vLongP) * Math.min(c.brakeCap + w.surfaceRolling * N, cancelLong)
  c.long = 0
  c.lat = 0
}

/** Brakes stronger than the available grip lock the wheel; the handbrake locks the rear. */
export function isLocking(c: Contact, handbrake: boolean) {
  return (c.brakeCap > c.maxF * 1.05 && Math.abs(c.vLong) > 0.4) || (handbrake && c.rear)
}

/** Longitudinal force of an undriven (or locked) wheel: brakes + rolling resistance. */
export function freeRollingForce(c: Contact, locked: boolean) {
  c.long = clampAbs(c.resist, locked ? c.kinetic : c.maxF)
}

/**
 * Phase 3: lateral force. Pacejka-like slip-angle curve, never stronger than the
 * force that would cancel the sideways velocity this step (static friction at
 * low speed), and limited by the grip left over after the longitudinal force
 * (friction ellipse). Returns the slip angle.
 */
export function lateralForce(c: Contact, dt: number, handbrake: boolean) {
  const alpha = Math.atan2(Math.abs(c.vLatP), Math.max(Math.abs(c.vLong), 0.6))
  const curve = c.maxF * Math.sin(TIRE.C * Math.atan(TIRE.B * alpha))
  const cancel = ((Math.abs(c.vLatP) * c.mEff) / dt) * 0.9
  const usage = c.maxF > 0 ? Math.min(1, Math.abs(c.long) / c.maxF) : 1
  let limit = c.maxF * Math.max(TIRE.minLateralWhileSlipping, Math.sqrt(1 - usage * usage))
  if (handbrake && c.rear) limit *= TIRE.handbrakeLateral
  c.lat = clampAbs(-sign(c.vLatP) * Math.min(curve, cancel), limit)
  return alpha
}

/** 0..1 sliding amount for audio/effects. */
export function slideAmount(c: Contact, alpha: number, spin: number, locked: boolean) {
  const speed = Math.hypot(c.vLong, c.vLatP)
  const latSlide = Math.max(0, Math.min(1, (alpha - 0.12) / 0.4)) * Math.min(1, speed / 3)
  const spinSlide = Math.min(1, Math.abs(spin) / 20)
  const lockSlide = locked ? Math.min(1, Math.abs(c.vLong) / 4) : 0
  return Math.max(latSlide, spinSlide, lockSlide)
}

/** Wheel in the air: integrates spin from drive torque, brakes and bearing drag. */
export function spinAirborneWheel(w: WheelState, dt: number, braking: boolean, inertia: number) {
  w.omega += (w.driveTorque / inertia) * dt
  w.omega *= Math.exp(-dt * 0.4)
  if (braking) w.omega *= Math.exp(-dt * 14)
  w.omega = Math.max(-200, Math.min(200, w.omega))
  w.spinExtra = 0
  w.slip = 0
  w.locked = false
}
