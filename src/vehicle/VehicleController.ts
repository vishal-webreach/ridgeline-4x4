import { Quaternion, Vector3 } from 'three'
import type * as RAPIER from '@dimforge/rapier3d-compat'
import { VEHICLE } from './vehicleConfig'
import { Drivetrain } from './Drivetrain'
import { castSuspension, suspensionForce } from './Suspension'
import {
  createContact, freeRollingForce, isLocking, lateralForce, prepareContact, slideAmount, spinAirborneWheel,
} from './WheelPhysics'
import { createWheelState, resetWheelState, type WheelState } from './wheelState'
import { driveInput } from '../game/input'
import { sessionRules, telemetry, touchInput, vehicleCommands, winch } from '../game/runtime'
import { findAnchor } from './winchAnchors'
import { useGameStore } from '../game/store'
import { getWorld } from '../environment/worldState'
import { sampleHeight } from '../environment/terrainGenerator'
import { GRAVITY } from '../physics/constants'
import type { RapierModule } from '../physics/rapierTypes'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step))

const ST = VEHICLE.steering
const BR = VEHICLE.brakes

/**
 * Four-wheel raycast vehicle running inside Rapier's fixed timestep.
 * Every step: read driver input → steer → suspension rays → spring/damper
 * forces → drivetrain torque → tyre friction → impulses on the chassis.
 */
export class VehicleController {
  readonly wheels: WheelState[] = VEHICLE.wheels.map(createWheelState)
  private readonly rearWheels = this.wheels.filter((w) => !w.cfg.front)
  private readonly contacts = this.wheels.map(createContact)
  /** shared extra spin of the driven wheels (rad/s) – non-zero while they spin faster than the ground */
  private groupSpin = 0
  readonly drivetrain = new Drivetrain()

  steer = 0
  throttle = 0
  brake = 0
  handbrake = false
  private tcs = 1
  private holding = true
  private flippedTime = 0
  private outOfFuelNotified = false
  private ray: RAPIER.Ray
  private filterFlags: number

  // scratch vectors (no allocations in the hot loop)
  private pos = new Vector3()
  private quat = new Quaternion()
  private up = new Vector3()
  private down = new Vector3()
  private fwd = new Vector3()
  private left = new Vector3()
  private vel = new Vector3()
  private anchor = new Vector3()
  private wheelFwd = new Vector3()
  private cv = new Vector3()
  private impulse = new Vector3()
  private point = new Vector3()
  private gravity = new Vector3(...GRAVITY)
  private prevVel = new Vector3()
  private hook = new Vector3()
  private winchScan = 0
  private hasPrevVel = false

  constructor(rapier: RapierModule) {
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    this.filterFlags = rapier.QueryFilterFlags.EXCLUDE_SENSORS
  }

  step(world: RAPIER.World, body: RAPIER.RigidBody, dt: number) {
    const R = VEHICLE.wheelRadius
    const store = useGameStore.getState()
    const playing = store.phase === 'playing'
    const { fourWD, lowRange } = store

    if (vehicleCommands.placeAt) {
      const p = vehicleCommands.placeAt
      vehicleCommands.placeAt = null
      vehicleCommands.recover = false
      if (p.refuel) {
        this.drivetrain.reset(true)
        telemetry.odometer = 0
        telemetry.damage = 0
      }
      this.placeOnGround(world, body, p.x, p.z, p.yaw)
    } else if (vehicleCommands.restart) {
      vehicleCommands.restart = false
      vehicleCommands.recover = false
      this.restart(body)
    } else if (vehicleCommands.recover) {
      vehicleCommands.recover = false
      this.recover(world, body)
    }

    // ---- chassis state -------------------------------------------------------
    const t = body.translation()
    const r = body.rotation()
    this.pos.set(t.x, t.y, t.z)
    this.quat.set(r.x, r.y, r.z, r.w)
    this.up.set(0, 1, 0).applyQuaternion(this.quat)
    this.down.copy(this.up).negate()
    this.fwd.set(0, 0, 1).applyQuaternion(this.quat)
    this.left.set(1, 0, 0).applyQuaternion(this.quat)
    const lv = body.linvel()
    this.vel.set(lv.x, lv.y, lv.z)
    const speed = this.vel.dot(this.fwd)
    const mass = body.mass()

    if (this.pos.y < -80) this.recover(world, body)
    if (sessionRules.damage) this.updateDamage(dt)
    else telemetry.damage = 0

    this.updateDriver(dt, playing, speed)
    this.updateSteering(dt, speed)
    this.updateTirePressure(dt, playing)

    // ---- suspension ----------------------------------------------------------
    for (const w of this.wheels) {
      this.anchor.copy(w.anchorLocal).applyQuaternion(this.quat).add(this.pos)
      this.steeredForward(w.steerAngle, this.wheelFwd)
      castSuspension(world, this.ray, body, this.filterFlags, w, this.anchor, this.down, this.wheelFwd, dt)
      w.force = suspensionForce(w, dt)
    }
    this.applyAntiRoll(0, 1, VEHICLE.antiRoll.front)
    this.applyAntiRoll(2, 3, VEHICLE.antiRoll.rear)

    // ---- drivetrain ------------------------------------------------------------
    const driven = fourWD ? this.wheels : this.rearWheels
    let omegaSum = 0
    for (const w of driven) omegaSum += w.omega
    const power = 1 - telemetry.damage * VEHICLE.damage.powerLoss
    const wheelTorque = this.drivetrain.update(dt, this.throttle * this.tcs * power, omegaSum / driven.length, speed / R, lowRange)
    const ratio = this.drivetrain.ratio(this.drivetrain.gear, lowRange)
    // locked differentials: all driven wheels turn together, so tyres + engine
    // (reflected through the gearing) spin up as one rotating body
    const groupInertia =
      VEHICLE.wheelInertia * driven.length + VEHICLE.engine.inertia * ratio * ratio * VEHICLE.transmission.efficiency

    // ---- tyres, phase 1: contact data --------------------------------------------
    let grounded = 0
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i]
      w.driveTorque = 0
      if (!w.grounded) continue
      grounded++
      const v = body.velocityAtPoint(w.contactPoint)
      this.cv.set(v.x, v.y, v.z)
      this.steeredForward(w.steerAngle, this.wheelFwd)
      const c = this.contacts[i]
      const brakeForce = this.brake * (w.cfg.front ? BR.front : BR.rear)
      prepareContact(w, this.cv, this.wheelFwd, { dt, mass, brakeForce, handbrake: this.handbrake, gravity: this.gravity }, c)
      w.locked = isLocking(c, this.handbrake) && (!driven.includes(w) || this.throttle < 0.05 || (this.handbrake && c.rear))
    }

    // ---- tyres, phase 2: share drive torque through the locked differentials -----
    let sumMax = 0
    let sumKinetic = 0
    let sumResist = 0
    let sumBrake = 0
    let gripping = 0
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i]
      const c = this.contacts[i]
      if (!w.grounded) continue
      if (!driven.includes(w) || w.locked) {
        freeRollingForce(c, w.locked)
        continue
      }
      sumMax += c.maxF
      sumKinetic += c.kinetic
      sumResist += c.resist
      sumBrake += c.brakeCap
      gripping++
    }
    if (gripping > 0 && sumMax > 1) {
      const totalDrive = wheelTorque / R
      if (Math.abs(this.groupSpin) > 0.05) {
        // wheelspin: every driven tyre pushes with sliding friction in the spin direction;
        // the spin itself follows the torque balance on the driveline
        const s = Math.sign(this.groupSpin)
        for (let i = 0; i < this.wheels.length; i++) {
          const w = this.wheels[i]
          if (w.grounded && !w.locked && driven.includes(w)) this.contacts[i].long = s * this.contacts[i].kinetic
        }
        const net = wheelTorque - s * (sumKinetic + sumBrake) * R
        const next = this.groupSpin + (net / groupInertia) * dt
        this.groupSpin = Math.sign(next) === s ? next : 0 // spin decayed: tyres grip again
      } else {
        const want = totalDrive + sumResist
        const fits = Math.abs(want) <= sumMax
        for (let i = 0; i < this.wheels.length; i++) {
          const w = this.wheels[i]
          if (!w.grounded || w.locked || !driven.includes(w)) continue
          const c = this.contacts[i]
          // a locked diff feeds torque to the tyres that have grip
          c.long = fits ? want * (c.maxF / sumMax) : Math.sign(want) * c.maxF
        }
        if (!fits && Math.abs(totalDrive) > Math.abs(sumResist)) {
          // more drive than the tyres can hold: the driveline starts to spin up
          this.groupSpin = Math.sign(totalDrive) * (((Math.abs(want) - sumMax) * R) / groupInertia) * dt
        }
      }
      this.groupSpin = clamp(this.groupSpin, -90, 90)
    } else {
      this.groupSpin = 0
    }
    const slipRatio = (Math.abs(this.groupSpin) * R) / Math.max(Math.abs(speed), 1.5)

    // ---- tyres, phase 3: lateral grip, impulses, wheel speeds --------------------
    let slip = 0
    let groundedOmega = 0
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i]
      const c = this.contacts[i]
      const isDriven = driven.includes(w)
      if (!w.grounded) {
        w.driveTorque = gripping === 0 && isDriven ? wheelTorque / driven.length : 0
        spinAirborneWheel(w, dt, this.brake > 0.1 || (this.handbrake && !w.cfg.front), groupInertia / driven.length)
        continue
      }
      this.anchor.copy(w.anchorLocal).applyQuaternion(this.quat).add(this.pos)
      // suspension force along the chassis up axis, through the mount
      this.impulse.copy(this.up).multiplyScalar(w.force * dt)
      body.applyImpulseAtPoint(this.impulse, this.anchor, true)

      const alpha = lateralForce(c, dt, this.handbrake)
      // tyre forces act between contact patch and hub (limits unrealistic roll-over torque)
      this.point.copy(w.contactPoint).lerp(this.anchor.addScaledVector(this.down, w.length), 0.6)
      this.impulse.copy(c.forward).multiplyScalar(c.long * dt).addScaledVector(c.side, c.lat * dt)
      body.applyImpulseAtPoint(this.impulse, this.point, true)

      w.spinExtra = isDriven && !w.locked ? this.groupSpin : 0
      w.driveTorque = isDriven && !w.locked ? c.long * R : 0
      w.omega = w.locked ? 0 : c.vLong / R + w.spinExtra
      if (isDriven && !w.locked) groundedOmega = w.omega
      w.slip = slideAmount(c, alpha, w.spinExtra, w.locked)
      slip = Math.max(slip, w.slip)
    }
    // airborne driven wheels turn with the grounded ones (locked differentials)
    if (gripping > 0) for (const w of driven) if (!w.grounded) w.omega = groundedOmega
    for (const w of this.wheels) w.spinAngle = (w.spinAngle + w.omega * dt) % (Math.PI * 2)

    // ---- traction control ---------------------------------------------------
    // integral controller: trims the throttle until wheelspin settles near the
    // target slip ratio (peak tyre grip), then gives throttle back
    const TC = VEHICLE.tractionControl
    if (TC.enabled && this.throttle > 0.05 && gripping > 0) {
      const err = slipRatio - TC.slipThreshold
      const rate = err > 0 ? -Math.min(err, 1.5) * TC.dropRate : TC.recoverRate
      this.tcs = clamp(this.tcs + rate * dt, TC.minThrottle, 1)
    } else {
      this.tcs = approach(this.tcs, 1, dt * 3)
    }

    this.updateWinch(body, dt, playing)

    // ---- aerodynamic drag ------------------------------------------------------
    const A = VEHICLE.aero
    const vMag = this.vel.length()
    if (vMag > 0.1) {
      const drag = 0.5 * A.airDensity * A.dragArea * vMag * vMag
      this.impulse.copy(this.vel).multiplyScalar((-drag / vMag) * dt)
      body.applyImpulse(this.impulse, true)
    }

    this.updateFuelAndTelemetry(dt, speed, grounded, slip)
  }

  // -------------------------------------------------------------------------

  private steeredForward(angle: number, out: Vector3) {
    return out.copy(this.fwd).multiplyScalar(Math.cos(angle)).addScaledVector(this.left, Math.sin(angle))
  }

  private updateDriver(dt: number, playing: boolean, speed: number) {
    // keyboard (digital) and touch pedals (analog) are merged
    const fwdAmt = playing ? Math.max(driveInput.forward ? 1 : 0, touchInput.throttle) : 0
    const backAmt = playing ? Math.max(driveInput.back ? 1 : 0, touchInput.brake) : 0
    const fwdKey = fwdAmt > 0.05
    const backKey = backAmt > 0.05
    let wantThrottle = 0
    let wantBrake = 0
    const dtn = this.drivetrain
    dtn.manual = useGameStore.getState().transmission === 'manual'
    if (dtn.manual) {
      // manual gearbox: W is the throttle in any gear (R drives backwards), S is the brake
      wantThrottle = fwdAmt
      wantBrake = backAmt
    } else if (dtn.gear !== -1) {
      if (fwdKey) wantThrottle = fwdAmt
      if (backKey) {
        if (speed > 0.8) wantBrake = backAmt
        else if (!fwdKey) dtn.selectDirection(true)
      }
    } else {
      if (backKey) wantThrottle = backAmt
      if (fwdKey) {
        if (speed < -0.8) wantBrake = fwdAmt
        else if (!backKey) dtn.selectDirection(false)
      }
    }
    // hill-hold: latches when (nearly) stopped with no throttle, releases on throttle
    if (wantThrottle > 0.05) this.holding = false
    else if (Math.abs(speed) < BR.holdSpeed) this.holding = true
    if (this.holding) wantBrake = Math.max(wantBrake, 1)
    // anti-rollback (automatic only): no throttle and moving against the selected gear direction
    const gearDir = dtn.gear === -1 ? -1 : 1
    if (!dtn.manual && dtn.gear !== 0 && wantThrottle < 0.05 && speed * gearDir < -BR.holdSpeed) wantBrake = Math.max(wantBrake, 1)

    this.throttle += (wantThrottle - this.throttle) * Math.min(1, dt * (wantThrottle > this.throttle ? 5 : 10))
    this.brake += (wantBrake - this.brake) * Math.min(1, dt * 12)
    this.handbrake = playing && (driveInput.handbrake || touchInput.handbrake)
  }

  private updateSteering(dt: number, speed: number) {
    const input = clamp((driveInput.left ? 1 : 0) - (driveInput.right ? 1 : 0) + touchInput.steer, -1, 1)
    const maxAngle = lerp(ST.maxAngle, ST.highSpeedAngle, clamp(Math.abs(speed) / ST.highSpeed, 0, 1))
    const target = useGameStore.getState().phase === 'playing' ? input * maxAngle : 0
    const returning = target === 0 || Math.sign(target) !== Math.sign(this.steer)
    this.steer = approach(this.steer, target, (returning ? ST.returnRate : ST.rate) * dt)
    this.steer = clamp(this.steer, -maxAngle, maxAngle)

    // Ackermann geometry: inner wheel turns tighter than the outer wheel
    const L = VEHICLE.wheelBase
    for (const w of this.wheels) {
      if (!w.cfg.front) {
        w.steerAngle = 0
        continue
      }
      if (Math.abs(this.steer) < 1e-4) {
        w.steerAngle = 0
        continue
      }
      const turnRadius = L / Math.tan(this.steer)
      w.steerAngle = Math.atan(L / (turnRadius - w.cfg.x))
    }
  }

  /**
   * Winch: a rope from the front fairlead to the anchor. It only pulls when
   * taut (spring + damper, capped at the winch's rated force); reeling in
   * shortens it, paying out lengthens it. Too much distance releases the hook.
   */
  private updateWinch(body: RAPIER.RigidBody, dt: number, playing: boolean) {
    const W = VEHICLE.winch
    this.hook.set(W.point.x, W.point.y, W.point.z).applyQuaternion(this.quat).add(this.pos)
    winch.hook.x = this.hook.x
    winch.hook.y = this.hook.y
    winch.hook.z = this.hook.z
    if (!winch.attached) {
      winch.tension = 0
      if (++this.winchScan % 10 === 0) winch.candidate = findAnchor(this.hook.x, this.hook.y, this.hook.z, this.fwd.x, this.fwd.z, W.maxLength)
      return
    }
    winch.candidate = null
    if (playing && (driveInput.winchIn || touchInput.winchIn)) winch.length = Math.max(1.5, winch.length - W.reelSpeed * dt)
    if (playing && (driveInput.winchOut || touchInput.winchOut)) winch.length = Math.min(W.maxLength, winch.length + W.payoutSpeed * dt)
    const a = winch.anchor
    this.impulse.set(a.x - this.hook.x, a.y - this.hook.y, a.z - this.hook.z)
    const dist = this.impulse.length()
    if (dist > W.maxLength + 6) {
      winch.attached = false
      winch.tension = 0
      useGameStore.getState().showToast('Winch cable released – too far from the anchor', 'warn')
      return
    }
    if (dist <= winch.length || dist < 1e-3) {
      winch.tension = 0 // slack rope
      return
    }
    this.impulse.divideScalar(dist)
    const v = body.velocityAtPoint(this.hook)
    const stretchRate = -(v.x * this.impulse.x + v.y * this.impulse.y + v.z * this.impulse.z)
    const force = clamp(W.stiffness * (dist - winch.length) + W.damping * stretchRate, 0, W.maxForce)
    winch.tension = force
    this.impulse.multiplyScalar(force * dt)
    body.applyImpulseAtPoint(this.impulse, this.hook, true)
  }

  /** Air down (Q) / pump up (E): deflating is quick, the compressor is slower. */
  private updateTirePressure(dt: number, playing: boolean) {
    if (!playing) return
    const P = VEHICLE.tirePressure
    if (driveInput.deflate || touchInput.deflate) telemetry.tirePressure = Math.max(P.min, telemetry.tirePressure - P.deflateRate * dt)
    if (driveInput.inflate || touchInput.inflate) telemetry.tirePressure = Math.min(P.max, telemetry.tirePressure + P.inflateRate * dt)
  }

  /**
   * Impact damage: compares the chassis velocity with the last step's
   * (minus gravity). Driving forces change it by well under 1 m/s per step,
   * so only real crashes and hard landings exceed the threshold.
   */
  private updateDamage(dt: number) {
    const D = VEHICLE.damage
    if (this.hasPrevVel) {
      const dv = Math.hypot(this.vel.x - this.prevVel.x, this.vel.y - this.prevVel.y - this.gravity.y * dt, this.vel.z - this.prevVel.z)
      if (dv > D.impactDv) telemetry.damage = Math.min(1, telemetry.damage + Math.min(0.25, (dv - D.impactDv) * D.perDv))
    }
    this.prevVel.copy(this.vel)
    this.hasPrevVel = true
  }

  private applyAntiRoll(a: number, b: number, k: number) {
    const wa = this.wheels[a]
    const wb = this.wheels[b]
    if (!wa.grounded || !wb.grounded) return
    const f = (wa.compression - wb.compression) * k
    wa.force = Math.max(0, wa.force + f)
    wb.force = Math.max(0, wb.force - f)
  }

  private updateFuelAndTelemetry(dt: number, speed: number, grounded: number, slip: number) {
    const F = VEHICLE.fuel
    const world = getWorld()
    const fs = world.fuelStation
    const nearPump = Math.hypot(this.pos.x - fs.x, this.pos.z - fs.z) < F.stationRadius
    const refueling = nearPump && Math.abs(speed) < 1.5 && this.drivetrain.fuel < F.capacity
    if (refueling) this.drivetrain.fuel = Math.min(F.capacity, this.drivetrain.fuel + F.refuelRate * dt)
    if (sessionRules.infiniteFuel) this.drivetrain.fuel = F.capacity
    const repairing = nearPump && Math.abs(speed) < 1.5 && telemetry.damage > 0
    if (repairing) telemetry.damage = Math.max(0, telemetry.damage - VEHICLE.damage.repairRate * dt)

    const outOfFuel = this.drivetrain.fuel <= 0
    if (outOfFuel && !this.outOfFuelNotified) {
      this.outOfFuelNotified = true
      useGameStore.getState().showToast('Out of fuel – press Restart in the pause menu', 'warn')
    }
    if (!outOfFuel) this.outOfFuelNotified = false

    if (this.up.y < 0.3) this.flippedTime += dt
    else this.flippedTime = 0

    const T = telemetry
    T.speed = speed
    T.speedKmh = speed * 3.6
    T.rpm = this.drivetrain.rpm
    T.gear = this.drivetrain.gear
    T.gearLabel = this.drivetrain.gearLabel
    T.shifting = this.drivetrain.shifting
    T.throttle = this.throttle
    T.brake = this.brake
    T.steer = this.steer
    T.fuelLiters = this.drivetrain.fuel
    T.fuelCapacity = F.capacity
    T.slip = slip
    T.tcsActive = this.tcs < 0.93
    T.wheelsGrounded = grounded
    T.pitch = (Math.asin(clamp(this.fwd.y, -1, 1)) * 180) / Math.PI
    T.roll = (Math.asin(clamp(this.left.y, -1, 1)) * 180) / Math.PI
    T.flipped = this.flippedTime > 1.5
    T.refueling = refueling
    T.repairing = repairing
    T.fuelRate = this.drivetrain.fuelRate
    for (let i = 0; i < 4; i++) T.wheelsDown[i] = this.wheels[i].grounded
    T.x = this.pos.x
    T.z = this.pos.z
    T.heading = Math.atan2(this.fwd.x, this.fwd.z)
    T.outOfFuel = outOfFuel
    T.engineLoad = this.drivetrain.load
    T.odometer += (Math.abs(speed) * dt) / 1000
  }

  // ---- recovery --------------------------------------------------------------

  private place(body: RAPIER.RigidBody, x: number, y: number, z: number, yaw: number) {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)
    body.setTranslation({ x, y, z }, true)
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    for (const w of this.wheels) resetWheelState(w)
    this.steer = 0
    this.throttle = 0
    this.tcs = 1
    this.groupSpin = 0
    this.hasPrevVel = false
    this.holding = true
    winch.attached = false
    winch.tension = 0
    this.flippedTime = 0
    this.pos.set(x, y, z)
    this.quat.copy(q)
  }

  /** Drops the truck upright at (x, z), above whatever is there. */
  placeOnGround(world: RAPIER.World, body: RAPIER.RigidBody, x: number, z: number, yaw: number) {
    const terrain = getWorld().terrain
    let ground = sampleHeight(terrain, x, z)
    this.ray.origin = { x, y: ground + 40, z }
    this.ray.dir = { x: 0, y: -1, z: 0 }
    const hit = world.castRay(this.ray, 60, true, this.filterFlags, undefined, undefined, body)
    if (hit) ground = Math.max(ground, ground + 40 - hit.timeOfImpact)
    this.drivetrain.selectDirection(false)
    this.place(body, x, ground + 1.3, z, yaw)
  }

  /** Puts the truck back on its wheels where it is (lifted above any rock). */
  recover(world: RAPIER.World, body: RAPIER.RigidBody) {
    const t = body.translation()
    const r = body.rotation()
    const q = new Quaternion(r.x, r.y, r.z, r.w)
    const f = new Vector3(0, 0, 1).applyQuaternion(q)
    const yaw = Math.abs(f.y) > 0.95 ? 0 : Math.atan2(f.x, f.z)
    const terrain = getWorld().terrain
    let x = t.x
    let z = t.z
    const lim = terrain.half - 30
    x = clamp(x, -lim, lim)
    z = clamp(z, -lim, lim)
    let ground = sampleHeight(terrain, x, z)
    this.ray.origin = { x, y: ground + 40, z }
    this.ray.dir = { x: 0, y: -1, z: 0 }
    const hit = world.castRay(this.ray, 60, true, this.filterFlags, undefined, undefined, body)
    if (hit) ground = Math.max(ground, ground + 40 - hit.timeOfImpact)
    this.place(body, x, ground + 1.35, z, yaw)
  }

  /** Back to the spawn point with a full tank. */
  restart(body: RAPIER.RigidBody) {
    const s = getWorld().spawn
    this.drivetrain.reset(true)
    telemetry.odometer = 0
    this.place(body, s.x, s.y + 1.25, s.z, s.yaw)
  }
}
