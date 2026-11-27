/**
 * All tuning values for the pickup. Units are SI (kg, m, s, N, N·m).
 * Vehicle local frame: +Z forward, +Y up, +X left.
 */

export interface WheelConfig {
  id: 'FL' | 'FR' | 'RL' | 'RR'
  /** lateral position of the wheel centre (+X = left) */
  x: number
  /** longitudinal position (+Z = front) */
  z: number
  front: boolean
  left: boolean
}

export const BASE_TORQUE_CURVE: [number, number][] = [
  [0, 260], [800, 330], [1500, 480], [2400, 560], [3400, 520], [4200, 440], [4800, 340],
]

export const VEHICLE = {
  mass: 1950,
  /** body-frame centre of mass (lowered: engine, frame and axles sit low) */
  centerOfMass: { x: 0, y: -0.05, z: 0.12 },
  /** principal inertia: x = pitch, y = yaw, z = roll */
  inertia: { x: 3300, y: 3700, z: 1050 },

  wheelRadius: 0.45,
  wheelWidth: 0.32,
  wheelInertia: 3.2,
  wheels: [
    { id: 'FL', x: 0.92, z: 1.55, front: true, left: true },
    { id: 'FR', x: -0.92, z: 1.55, front: true, left: false },
    { id: 'RL', x: 0.92, z: -1.45, front: false, left: true },
    { id: 'RR', x: -0.92, z: -1.45, front: false, left: false },
  ] as WheelConfig[],
  wheelBase: 3.0,
  trackWidth: 1.84,

  suspension: {
    /** height of the suspension top mount in the body frame */
    anchorY: 0.05,
    /** fully extended length from mount to wheel centre */
    restLength: 0.65,
    stiffness: 22000,
    bumpDamping: 2700,
    reboundDamping: 3800,
    /** below this length the bump stop engages */
    bumpStopLength: 0.06,
    bumpStopStiffness: 220000,
    maxForce: 70000,
    /** longitudinal ray offsets (× wheel radius) approximating the round tyre */
    rayOffsets: [-0.7, -0.35, 0, 0.35, 0.7],
  },

  antiRoll: { front: 9000, rear: 6000 },

  steering: {
    maxAngle: 0.62,
    /** max angle at high speed */
    highSpeedAngle: 0.17,
    /** speed (m/s) at which the high-speed limit applies */
    highSpeed: 30,
    rate: 2.2,
    returnRate: 3.6,
  },

  tire: {
    /** grip multiplier on top of the surface friction coefficient */
    grip: 1.0,
    /** Pacejka-style lateral curve: F = mu·N·sin(C·atan(B·α)) */
    B: 9,
    C: 1.35,
    rollingResistance: 0.018,
    /** sliding/spinning friction as a fraction of peak grip */
    kineticFriction: 0.9,
    /** lateral grip that always remains while the tyre spins / locks */
    minLateralWhileSlipping: 0.42,
    /** lateral grip multiplier on the rear axle with the handbrake on */
    handbrakeLateral: 0.5,
  },

  brakes: {
    /** max brake force per wheel at the contact patch */
    front: 7500,
    rear: 5000,
    handbrake: 9000,
    /** below this speed (m/s) with no throttle the hill-hold latches the brakes */
    holdSpeed: 1.2,
  },

  engine: {
    idleRpm: 800,
    redlineRpm: 4500,
    limiterRpm: 4700,
    /** torque converter stall speed */
    stallRpm: 2200,
    /** extra torque multiplication at full converter slip */
    converterMultiplication: 0.8,
    /** [rpm, N·m] */
    torqueCurve: BASE_TORQUE_CURVE.map((p) => [...p]) as [number, number][],
    /** friction / compression braking torque at redline */
    engineBrakeTorque: 95,
    responsiveness: 9,
    /** crank + flywheel + converter inertia (kg·m²), reflected to the wheels through the gearing */
    inertia: 0.32,
  },

  transmission: {
    reverse: 3.7,
    ratios: [0, 4.17, 2.34, 1.52, 1.14, 0.87],
    finalDrive: 4.1,
    lowRange: 2.72,
    efficiency: 0.88,
    shiftTime: 0.35,
    shiftCooldown: 0.9,
    /** upshift rpm at zero / full throttle */
    upshift: [2100, 4100],
    /** must stay well below the rpm right after an upshift (≈ 0.56 × upshift for 1→2) */
    downshift: [1100, 1700],
    /** electronic limiter in reverse (≈ 30 km/h) */
    reverseLimiterRpm: 3000,
    /** LOW range is a crawler range: the gearbox holds 1st–2nd (≈ 30 km/h max) */
    lowRangeMaxGear: 2,
  },

  /** Traction control: integral throttle trim that holds wheelspin near slipThreshold. */
  tractionControl: { enabled: true, slipThreshold: 0.12, dropRate: 4, recoverRate: 1.6, minThrottle: 0.15 },

  aero: { airDensity: 1.2, dragArea: 1.45 },

  fuel: {
    capacity: 80,
    /** brake-specific fuel consumption, g/kWh (turbo-diesel) */
    bsfc: 230,
    density: 0.84,
    idleLitresPerHour: 1.2,
    /** gameplay acceleration so the gauge visibly moves */
    gameplayMultiplier: 4,
    refuelRate: 6,
    stationRadius: 7,
  },

  /** Tyre pressure (psi): airing down adds grip off-road but costs rolling resistance. */
  tirePressure: {
    min: 8,
    max: 36,
    default: 30,
    deflateRate: 7,
    inflateRate: 3,
  },

  /**
   * Body damage from violent impacts: a sudden change of chassis velocity
   * within one physics step (≈ g-force of a crash or a hard landing).
   */
  damage: {
    /** velocity change per step (m/s) that counts as an impact (≈ 7 g at 60 Hz) */
    impactDv: 1.2,
    /** damage per m/s of velocity change above the threshold */
    perDv: 0.035,
    /** engine power lost at 100 % damage */
    powerLoss: 0.45,
    repairRate: 0.08,
  },

  /** Front winch (≈ 10 000 lb class). */
  winch: {
    /** fairlead position in the body frame (set per truck) */
    point: { x: 0, y: 0.32, z: 2.9 },
    maxForce: 45000,
    maxLength: 35,
    reelSpeed: 0.75,
    payoutSpeed: 1.5,
    stiffness: 60000,
    damping: 9000,
  },

  chassis: {
    friction: 0.6,
    restitution: 0.05,
    linearDamping: 0.02,
    angularDamping: 0.25,
  },
}

export type VehicleConfig = typeof VEHICLE
