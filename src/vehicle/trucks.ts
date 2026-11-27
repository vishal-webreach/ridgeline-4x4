import { VEHICLE, BASE_TORQUE_CURVE } from './vehicleConfig'

export type TruckId = 'ridgeback' | 'nomad' | 'bandit'

export interface TruckSpec {
  id: TruckId
  name: string
  tagline: string
  body: 'pickup' | 'wagon'
  doors: 2 | 4
  paint: string
  trim: string
  /** wheel-centre Z of the front / rear axle (body frame, +Z forward) */
  frontAxle: number
  rearAxle: number
  track: number
  bodyWidth: number
  wheelRadius: number
  wheelWidth: number
  mass: number
  inertia: { x: number; y: number; z: number }
  com: { x: number; y: number; z: number }
  torqueScale: number
  springStiffness: number
  restLength: number
  antiRoll: { front: number; rear: number }
  accessories: { roofRack: boolean; bullBar: boolean; snorkel: boolean; rollBar: boolean; spare: 'bed' | 'rear' }
  /** 0..1 bars for the selection screen */
  stats: { power: number; weight: number; articulation: number; agility: number }
}

export const TRUCKS: TruckSpec[] = [
  {
    id: 'ridgeback',
    name: 'Ridgeback',
    tagline: 'Long-bed pickup · balanced all-rounder',
    body: 'pickup',
    doors: 4,
    paint: '#8a2614',
    trim: '#1b1c1e',
    frontAxle: 1.55,
    rearAxle: -1.45,
    track: 1.84,
    bodyWidth: 1.94,
    wheelRadius: 0.45,
    wheelWidth: 0.32,
    mass: 1950,
    inertia: { x: 3300, y: 3700, z: 1050 },
    com: { x: 0, y: -0.05, z: 0.12 },
    torqueScale: 1,
    springStiffness: 22000,
    restLength: 0.65,
    antiRoll: { front: 9000, rear: 6000 },
    accessories: { roofRack: true, bullBar: true, snorkel: true, rollBar: true, spare: 'bed' },
    stats: { power: 0.7, weight: 0.6, articulation: 0.65, agility: 0.55 },
  },
  {
    id: 'nomad',
    name: 'Nomad',
    tagline: 'Expedition wagon · heavy, torquey, stable',
    body: 'wagon',
    doors: 4,
    paint: '#c9ccc8',
    trim: '#22252a',
    frontAxle: 1.45,
    rearAxle: -1.4,
    track: 1.86,
    bodyWidth: 1.96,
    wheelRadius: 0.46,
    wheelWidth: 0.33,
    mass: 2300,
    inertia: { x: 3900, y: 4300, z: 1250 },
    com: { x: 0, y: -0.02, z: 0.08 },
    torqueScale: 1.15,
    springStiffness: 25000,
    restLength: 0.63,
    antiRoll: { front: 10000, rear: 7000 },
    accessories: { roofRack: true, bullBar: true, snorkel: true, rollBar: false, spare: 'rear' },
    stats: { power: 0.85, weight: 0.85, articulation: 0.55, agility: 0.4 },
  },
  {
    id: 'bandit',
    name: 'Bandit',
    tagline: 'Short-wheelbase 2-door · light and nimble crawler',
    body: 'wagon',
    doors: 2,
    paint: '#6e7a3c',
    trim: '#1b1c1e',
    frontAxle: 1.22,
    rearAxle: -1.15,
    track: 1.76,
    bodyWidth: 1.86,
    wheelRadius: 0.44,
    wheelWidth: 0.31,
    mass: 1650,
    inertia: { x: 2300, y: 2600, z: 900 },
    com: { x: 0, y: -0.06, z: 0.05 },
    torqueScale: 0.88,
    springStiffness: 18500,
    restLength: 0.7,
    antiRoll: { front: 6500, rear: 4500 },
    accessories: { roofRack: true, bullBar: true, snorkel: false, rollBar: false, spare: 'rear' },
    stats: { power: 0.55, weight: 0.35, articulation: 0.9, agility: 0.85 },
  },
]

export const getTruck = (id: TruckId) => TRUCKS.find((t) => t.id === id) ?? TRUCKS[0]

/** Derived body dimensions shared by the model and the colliders. */
export function bodyDims(t: TruckSpec) {
  const front = t.frontAxle + 1.09
  const rear = t.rearAxle - (t.body === 'pickup' ? 1.17 : 0.98)
  const windshieldBase = t.frontAxle - 0.59
  const cabBack = t.body === 'pickup' ? windshieldBase - 1.72 : rear + 0.08
  return { front, rear, windshieldBase, cabBack, length: front - rear, mid: (front + rear) / 2 }
}

/** Copies a truck's values into the live VEHICLE config used by the simulation. */
export function applyTruck(t: TruckSpec) {
  const V = VEHICLE
  V.mass = t.mass
  V.inertia = { ...t.inertia }
  V.centerOfMass = { ...t.com }
  V.wheelRadius = t.wheelRadius
  V.wheelWidth = t.wheelWidth
  const hx = t.track / 2
  V.wheels = [
    { id: 'FL', x: hx, z: t.frontAxle, front: true, left: true },
    { id: 'FR', x: -hx, z: t.frontAxle, front: true, left: false },
    { id: 'RL', x: hx, z: t.rearAxle, front: false, left: true },
    { id: 'RR', x: -hx, z: t.rearAxle, front: false, left: false },
  ]
  V.wheelBase = t.frontAxle - t.rearAxle
  V.trackWidth = t.track
  V.suspension.stiffness = t.springStiffness
  V.suspension.restLength = t.restLength
  // damping follows the spring so every truck keeps a similar damping ratio
  const corner = t.mass / 4
  const critical = 2 * Math.sqrt(t.springStiffness * corner)
  V.suspension.bumpDamping = critical * 0.36
  V.suspension.reboundDamping = critical * 0.5
  V.antiRoll = { ...t.antiRoll }
  V.winch.point = { x: 0, y: 0.32, z: bodyDims(t).front + 0.3 }
  V.engine.torqueCurve = BASE_TORQUE_CURVE.map(([rpm, nm]) => [rpm, nm * t.torqueScale] as [number, number])
}
