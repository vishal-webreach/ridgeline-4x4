/**
 * Static layout of the off-road park: map size, roads and the special
 * driving challenges. All coordinates are world metres (X/Z plane, Y up).
 */

export const WORLD = {
  seed: 1337,
  size: 640, // metres, square
  segments: 320, // 2 m terrain resolution
  half: 320,
  boundary: 296, // invisible walls keep the truck on the map
}

export type RoadKind = 'dirt' | 'rocky'

export interface RoadDef {
  id: string
  kind: RoadKind
  closed: boolean
  halfWidth: number
  shoulder: number
  /** moving-average window (in road samples, ~3 m each) used to smooth the road profile */
  smoothWindow: number
  /** maximum rise/run allowed along the road */
  maxGrade: number
  control: [number, number][]
}

/** Roads are carved into the terrain in this order. */
export const ROADS: RoadDef[] = [
  {
    id: 'loop',
    kind: 'dirt',
    closed: true,
    halfWidth: 3.8,
    shoulder: 5,
    smoothWindow: 7,
    maxGrade: 0.2,
    control: [
      [-170, -140], [-60, -185], [60, -175], [170, -150], [205, -40], [190, 80],
      [130, 175], [0, 190], [-130, 170], [-200, 70], [-205, -50],
    ],
  },
  {
    id: 'valley',
    kind: 'dirt',
    closed: false,
    halfWidth: 3.0,
    shoulder: 4,
    smoothWindow: 5,
    maxGrade: 0.28,
    control: [[0, -176], [-20, -112], [8, -30], [-30, 40], [40, 120], [12, 186]],
  },
  {
    id: 'summit',
    kind: 'dirt',
    closed: false,
    halfWidth: 2.9,
    shoulder: 4,
    smoothWindow: 4,
    maxGrade: 0.42,
    control: [[128, 172], [140, 184], [185, 200], [215, 216], [186, 238], [228, 252]],
  },
  {
    id: 'rocky',
    kind: 'rocky',
    closed: false,
    halfWidth: 2.6,
    shoulder: 3.5,
    smoothWindow: 3,
    maxGrade: 0.5,
    control: [[-198, 70], [-150, 78], [-100, 60], [-72, 15], [-35, -35], [15, -58], [65, -80]],
  },
]

/** Hand-placed driving challenges. */
export const FEATURES = {
  /** Steep grassy hill (≈30–33° on the climb line) – beyond 2WD traction, needs 4WD to summit. */
  hill: { x: 115, z: -72, height: 22, sigma: 26 },
  /** Boulder field the rocky trail runs through. */
  rockGarden: { x: -100, z: 60, radius: 38 },
  /** Alternating bumps that twist the chassis (axle articulation test). */
  whoops: { x: -15, z: -105, radius: 34 },
  /** Gully the valley trail dips through. */
  gully: { ax: 0, az: 85, bx: 110, bz: 150, depth: 5.5, width: 5 },
  /** Where the spawn point is chosen on the main loop. */
  spawnNear: { x: -112, z: -166 },
  /** Mud bogs (sticky, low grip – air the tyres down). */
  mudZones: [
    { x: -6, z: -70, r: 15 },
    { x: -8, z: 62, r: 12 },
    { x: -150, z: 77, r: 10 },
    { x: 150, z: -155, r: 9 },
  ],
}

export enum Surface {
  Grass = 0,
  Dirt = 1,
  Rock = 2,
  Mud = 3,
  Wood = 4,
}

/**
 * Tyre/surface model. `mu` is grip at road pressure, `airDown` the extra grip
 * gained when the tyres are fully aired down, `rolling` the rolling-resistance
 * coefficient (it grows as pressure drops).
 */
export const SURFACES = [
  { name: 'grass', mu: 0.8, airDown: 0.12, rolling: 0.022 },
  { name: 'dirt', mu: 0.92, airDown: 0.05, rolling: 0.015 },
  { name: 'rock', mu: 1.0, airDown: 0.14, rolling: 0.014 },
  { name: 'mud', mu: 0.46, airDown: 0.3, rolling: 0.075 },
  { name: 'wood', mu: 0.72, airDown: 0.1, rolling: 0.016 },
]
