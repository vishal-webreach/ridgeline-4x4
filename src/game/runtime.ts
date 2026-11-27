/**
 * Mutable, non-reactive runtime state shared between the physics step,
 * the HUD, lighting and audio. Written every frame / physics step; never
 * triggers React renders.
 */
export const telemetry = {
  speedKmh: 0,
  /** signed forward speed in m/s */
  speed: 0,
  rpm: 800,
  gear: 1,
  gearLabel: '1',
  shifting: false,
  throttle: 0,
  brake: 0,
  steer: 0,
  fuelLiters: 80,
  fuelCapacity: 80,
  /** litres per hour at the current load */
  fuelRate: 0,
  /** 0..1 */
  slip: 0,
  tcsActive: false,
  wheelsGrounded: 4,
  wheelsDown: [true, true, true, true],
  /** degrees */
  pitch: 0,
  roll: 0,
  flipped: false,
  refueling: false,
  repairing: false,
  outOfFuel: false,
  engineLoad: 0,
  /** km driven since spawn */
  odometer: 0,
  tirePressure: 30,
  /** 0..1 */
  damage: 0,
  x: 0,
  z: 0,
  heading: 0,
}

/** One-shot requests from UI/keyboard to the vehicle controller. */
export const vehicleCommands = {
  recover: false,
  restart: false,
  /** place the truck here on the next physics step (stage start) */
  placeAt: null as { x: number; z: number; yaw: number; refuel: boolean } | null,
}

/** Time of day + lights. */
export const lighting = {
  /** 0..24 */
  hours: 8,
  /** game hours per real second (1 game minute per second) */
  timeScale: 1 / 60,
  /** 0 at night … 1 in full daylight */
  daylight: 1,
  /** null = automatic */
  manualHeadlights: null as boolean | null,
  headlightsOn: false,
}

export interface Checkpoint {
  x: number
  y: number
  z: number
  yaw: number
  /** distance along the route (m) */
  at: number
}

/** Progress of the current timed stage. */
export const stageRuntime = {
  active: false,
  running: false,
  finished: false,
  elapsed: 0,
  total: 0,
  distanceToGo: 0,
  next: 0,
  checkpoints: [] as Checkpoint[],
  /** 2D route samples (x, z pairs) and cumulative distances */
  pts: new Float32Array(0),
  cum: new Float32Array(0),
  progressIndex: 0,
}

/** Analog inputs from the touch controls (0..1 / -1..1), merged with the keyboard. */
export const touchInput = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  inflate: false,
  deflate: false,
  winchIn: false,
  winchOut: false,
}

export type WeatherType = 'clear' | 'fog' | 'rain' | 'storm'

/** Current weather. `type` is the target; the numbers ease toward it. */
export const weather = {
  type: 'clear' as WeatherType,
  /** 0..1 rain intensity */
  rain: 0,
  /** 0..1 extra fog */
  fog: 0,
  /** 0..1 surface wetness (lowers grip) */
  wetness: 0,
  /** 0..1 cloud cover (dims the sun, hides the sky) */
  overcast: 0,
  /** lightning flash brightness, decays quickly */
  flash: 0,
}

/** Per-session rules (Custom Roam can change them). */
export const sessionRules = {
  infiniteFuel: false,
  damage: true,
}

export interface WinchAnchor {
  x: number
  y: number
  z: number
  kind: 'tree' | 'rock'
  dist: number
}

/** Winch: cable from the front bumper to a tree or boulder. */
export const winch = {
  attached: false,
  anchor: { x: 0, y: 0, z: 0, kind: 'tree' } as Omit<WinchAnchor, 'dist'>,
  /** paid-out cable length (m) */
  length: 0,
  /** current cable tension (N) */
  tension: 0,
  /** nearest usable anchor in front of the truck */
  candidate: null as WinchAnchor | null,
  /** world position of the winch fairlead (for the cable visual) */
  hook: { x: 0, y: 0, z: 0 },
}
