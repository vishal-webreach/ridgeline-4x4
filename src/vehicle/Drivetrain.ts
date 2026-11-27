import { VEHICLE } from './vehicleConfig'

const RAD_TO_RPM = 60 / (2 * Math.PI)
const RPM_TO_RAD = 1 / RAD_TO_RPM

const E = VEHICLE.engine
const T = VEHICLE.transmission
const F = VEHICLE.fuel

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function engineTorqueAt(rpm: number): number {
  const c = E.torqueCurve
  if (rpm <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0])
      return lerp(c[i - 1][1], c[i][1], t)
    }
  }
  return c[c.length - 1][1]
}

/**
 * Engine + torque converter + 5-speed automatic + 2-speed transfer case.
 * Produces the total drive torque at the wheels from throttle and wheel speed.
 */
export class Drivetrain {
  /** -1 = reverse, 0 = neutral, 1..5 forward */
  gear = 1
  /** manual gearbox: no automatic shifting */
  manual = false
  rpm = E.idleRpm
  fuel: number = F.capacity
  shifting = false
  engineTorque = 0
  load = 0
  /** current consumption, litres per hour */
  fuelRate = 0
  private shiftTimer = 0
  private pendingGear = 1
  private cooldown = 0

  reset(fullTank: boolean) {
    this.gear = 1
    this.pendingGear = 1
    this.rpm = E.idleRpm
    this.shiftTimer = 0
    this.cooldown = 0
    this.shifting = false
    if (fullTank) this.fuel = F.capacity
  }

  ratio(gear: number, lowRange: boolean): number {
    const g = gear === -1 ? T.reverse : T.ratios[gear]
    return g * T.finalDrive * (lowRange ? T.lowRange : 1)
  }

  get gearLabel(): string {
    return this.gear === -1 ? 'R' : this.gear === 0 ? 'N' : String(this.gear)
  }

  /** Where the gear lever sits (the gear being shifted into counts). */
  get leverGear(): number {
    return this.shifting ? this.pendingGear : this.gear
  }

  get maxGear() {
    return T.ratios.length - 1
  }

  /**
   * Lever input. Manual: any of R, N, 1–5 (sequential +/- or dragging the lever).
   * Automatic: R, N or D (1).
   */
  shiftManual(target: number, mode: 'auto' | 'manual') {
    if (mode === 'auto') {
      const g = target < 0 ? -1 : target === 0 ? 0 : 1
      if (g === -1 || g === 0) {
        this.gear = this.pendingGear = g
        this.shifting = false
      } else if (this.gear <= 0) {
        this.gear = this.pendingGear = 1
        this.shifting = false
      }
      return
    }
    const g = Math.max(-1, Math.min(this.maxGear, Math.round(target)))
    if (g === this.leverGear) return
    if (g <= 0 || this.gear <= 0) {
      // into / out of reverse and neutral: no shift delay needed
      this.gear = this.pendingGear = g
      this.shifting = false
      return
    }
    this.beginShift(g)
  }

  /** Driver selects drive direction (only called when nearly stopped). */
  selectDirection(reverse: boolean) {
    const g = reverse ? -1 : 1
    if (this.gear === g || (!reverse && this.gear > 0)) return
    this.gear = g
    this.pendingGear = g
    this.shiftTimer = 0
    this.shifting = false
  }

  /**
   * @param wheelOmega average angular velocity of the driven wheels (rad/s, + = forward)
   * @param groundOmega wheel speed implied by the vehicle's ground speed – used for shift
   *   decisions so wheelspin doesn't make the gearbox hunt
   * @returns total torque at the driven wheels (N·m, + = forward)
   */
  update(dt: number, throttleIn: number, wheelOmega: number, groundOmega: number, lowRange: boolean): number {
    const outOfFuel = this.fuel <= 0
    const throttle = outOfFuel ? 0 : throttleIn
    const dir = this.gear === -1 ? -1 : 1
    const ratio = this.ratio(this.gear, lowRange)

    // engine speed implied by the wheels (turbine side of the torque converter)
    const turbineRpm = Math.max(0, wheelOmega * dir) * ratio * RAD_TO_RPM
    // the converter lets the engine run above the turbine speed, up to stall
    // (in neutral the engine revs freely)
    const freeRpm = E.idleRpm + throttle * ((this.gear === 0 ? E.redlineRpm : E.stallRpm) - E.idleRpm)
    const targetRpm = outOfFuel ? Math.max(0, turbineRpm) : Math.max(turbineRpm, freeRpm)
    this.rpm += (targetRpm - this.rpm) * (1 - Math.exp(-dt * E.responsiveness))
    this.rpm = clamp(this.rpm, outOfFuel ? 0 : E.idleRpm * 0.9, E.limiterRpm + 150)

    const converterSlip = this.rpm > 1 ? clamp(1 - turbineRpm / this.rpm, 0, 1) : 0
    const multiplication = 1 + E.converterMultiplication * converterSlip

    let torque = engineTorqueAt(this.rpm) * throttle
    if (this.rpm >= E.limiterRpm) torque = 0
    if (this.gear === -1 && this.rpm >= T.reverseLimiterRpm) torque = 0
    if (this.shifting) torque *= 0.15
    this.engineTorque = torque
    this.load = throttle

    let wheelTorque = torque * multiplication * ratio * T.efficiency * dir

    // engine braking when coasting in gear (wheels drive the engine)
    if (throttle < 0.05 && turbineRpm > E.idleRpm + 100) {
      const brake = E.engineBrakeTorque * clamp(turbineRpm / E.redlineRpm, 0.2, 1.2)
      wheelTorque -= dir * brake * ratio * T.efficiency
    }

    // fuel: power × BSFC
    const powerKW = (Math.max(0, torque) * this.rpm * RPM_TO_RAD) / 1000
    const litresPerSecond = (powerKW * F.bsfc) / 3600 / 1000 / F.density + (outOfFuel ? 0 : F.idleLitresPerHour / 3600)
    this.fuel = Math.max(0, this.fuel - litresPerSecond * F.gameplayMultiplier * dt)
    this.fuelRate += (litresPerSecond * 3600 - this.fuelRate) * Math.min(1, dt * 3)

    this.autoShift(dt, throttle, groundOmega, lowRange)
    return wheelTorque
  }

  private autoShift(dt: number, throttle: number, groundOmega: number, lowRange: boolean) {
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.shifting) {
      this.shiftTimer -= dt
      if (this.shiftTimer <= 0) {
        this.gear = this.pendingGear
        this.shifting = false
        this.cooldown = T.shiftCooldown
      }
      return
    }
    if (this.manual || this.gear < 1 || this.cooldown > 0) return
    const rpmIn = (g: number) => Math.max(0, groundOmega) * this.ratio(g, lowRange) * RAD_TO_RPM
    const up = lerp(T.upshift[0], T.upshift[1], throttle)
    const down = lerp(T.downshift[0], T.downshift[1], throttle)
    const maxGear = lowRange ? T.lowRangeMaxGear : T.ratios.length - 1
    if (this.gear > maxGear) {
      this.beginShift(maxGear)
      return
    }
    // in LOW range hold the gear while coasting for engine-braked descents
    const holdForDescent = lowRange && throttle < 0.1 && this.rpm < E.redlineRpm
    if (this.gear < maxGear && rpmIn(this.gear) > up && !holdForDescent) this.beginShift(this.gear + 1)
    else if (this.gear > 1 && rpmIn(this.gear) < down && rpmIn(this.gear - 1) < up * 0.85) this.beginShift(this.gear - 1)
  }

  private beginShift(gear: number) {
    this.pendingGear = gear
    this.shifting = true
    this.shiftTimer = T.shiftTime
  }
}
