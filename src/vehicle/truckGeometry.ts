import {
  BoxGeometry, BufferGeometry, Curve, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, LatheGeometry,
  Matrix4, PlaneGeometry, Quaternion, Shape, ShapeGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, Euler,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bodyDims, type TruckSpec } from './trucks'

/**
 * Procedural, parametric truck bodies (pickup / wagon, any wheelbase).
 * Side profiles (Z/Y) are extruded across the width for a real silhouette –
 * wheel arches, hood, raked windshield – and every static part is merged per
 * material so a whole truck renders in about a dozen draw calls.
 * A Blender-made GLB can replace the visuals without touching the physics.
 */

export type MatKey =
  | 'paint' | 'trim' | 'plastic' | 'steel' | 'chrome' | 'frame' | 'glass' | 'headlight' | 'amber'
  | 'taillight' | 'lightbar' | 'bedLiner' | 'tire' | 'rim' | 'rimAccent' | 'case' | 'boards' | 'red'

type P2 = [number, number]
type V3 = [number, number, number]

const KEEP = new Set(['position', 'normal', 'uv'])
const UP = new Vector3(0, 1, 0)

class PartBuilder {
  private parts = new Map<MatKey, BufferGeometry[]>()
  private m = new Matrix4()
  private q = new Quaternion()

  add(mat: MatKey, geo: BufferGeometry, matrix?: Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (matrix) g.applyMatrix4(matrix)
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    g.clearGroups()
    g = g as BufferGeometry
    const list = this.parts.get(mat)
    if (list) list.push(g)
    else this.parts.set(mat, [g])
  }

  box(mat: MatKey, size: V3, pos: V3, rot?: V3) {
    this.q.setFromEuler(new Euler(...(rot ?? [0, 0, 0])))
    this.m.compose(new Vector3(...pos), this.q, new Vector3(1, 1, 1))
    this.add(mat, new BoxGeometry(...size), this.m)
  }

  /** Cylinder between two points. */
  tube(mat: MatKey, a: V3, b: V3, r: number, seg = 8) {
    const va = new Vector3(...a)
    const vb = new Vector3(...b)
    const dir = vb.clone().sub(va)
    const len = dir.length()
    this.q.setFromUnitVectors(UP, dir.normalize())
    this.m.compose(va.add(vb).multiplyScalar(0.5), this.q, new Vector3(1, 1, 1))
    this.add(mat, new CylinderGeometry(r, r, len, seg, 1), this.m)
  }

  /** Disc / short cylinder facing +Z (lights). */
  disc(mat: MatKey, r: number, depth: number, pos: V3, seg = 14) {
    this.q.setFromEuler(new Euler(Math.PI / 2, 0, 0))
    this.m.compose(new Vector3(...pos), this.q, new Vector3(1, 1, 1))
    this.add(mat, new CylinderGeometry(r, r, depth, seg), this.m)
  }

  build() {
    const out: { mat: MatKey; geometry: BufferGeometry }[] = []
    for (const [mat, list] of this.parts) {
      const geometry = mergeGeometries(list)!
      geometry.computeBoundingSphere()
      out.push({ mat, geometry })
    }
    return out
  }
}

/** Extrudes a side profile (u = Z, v = Y) symmetrically across X. */
function sideExtrude(points: P2[], totalWidth: number, bevel: number): BufferGeometry {
  const shape = new Shape(points.map(([u, v]) => new Vector2(u, v)))
  const depth = totalWidth - bevel * 2
  const geo = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6, steps: 1,
  })
  geo.rotateY(-Math.PI / 2) // shape X -> body Z, extrusion -> body X
  geo.translate(depth / 2, 0, 0)
  geo.computeVertexNormals()
  return geo
}

function pushArch(out: P2[], zc: number, yc: number, radius: number, yLine: number, steps = 10) {
  const dz = Math.sqrt(radius * radius - (yLine - yc) ** 2)
  const a0 = Math.atan2(yLine - yc, -dz)
  const a1 = Math.atan2(yLine - yc, dz)
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps)
    out.push([zc + Math.cos(a) * radius, yc + Math.sin(a) * radius])
  }
}

/** A flat pane whose +Z face points along `normal`. */
function pane(b: PartBuilder, w: number, h: number, center: Vector3, normal: Vector3) {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal.clone().normalize())
  b.add('glass', new PlaneGeometry(w, h), new Matrix4().compose(center, q, new Vector3(1, 1, 1)))
}

export interface TruckVisual {
  parts: { mat: MatKey; geometry: BufferGeometry }[]
  headlights: V3[]
}

const cache = new Map<string, TruckVisual>()

export function buildTruck(spec: TruckSpec): TruckVisual {
  const hit = cache.get(spec.id)
  if (hit) return hit
  const b = new PartBuilder()
  const d = bodyDims(spec)
  const { front, rear } = d
  const zW = d.windshieldBase
  const pickup = spec.body === 'pickup'
  const fz = spec.frontAxle
  const rz = spec.rearAxle
  const W = spec.bodyWidth
  const hw = W / 2
  const archR = spec.wheelRadius + 0.15
  const archYc = 0.52 - archR
  const bottom = 0.1

  // ---- lower body ------------------------------------------------------------
  const lower: P2[] = [[rear, bottom]]
  pushArch(lower, rz, archYc, archR, bottom)
  pushArch(lower, fz, archYc, archR, bottom)
  lower.push([front - 0.06, bottom], [front, 0.32], [front - 0.02, 0.7], [front - 0.14, 0.86], [zW + 0.09, 0.94])
  if (pickup) lower.push([d.cabBack - 0.02, 0.96], [d.cabBack - 0.02, 0.6], [rear, 0.6])
  else lower.push([rear + 0.06, 0.96], [rear, 0.9])
  b.add('paint', sideExtrude(lower, W, 0.04))

  // ---- cab / greenhouse -----------------------------------------------------------
  const cabBase = d.cabBack
  const roofBack = pickup ? cabBase + 0.1 : rear + 0.16
  const cabW = W - 0.22
  b.add('paint', sideExtrude([[cabBase, 0.94], [zW, 0.94], [zW - 0.54, 1.58], [roofBack, 1.62]], cabW, 0.05))
  b.box('trim', [cabW - 0.08, 0.025, zW - 0.6 - roofBack], [0, 1.675, (zW - 0.6 + roofBack) / 2])

  // windshield & rear glass
  const wsN = new Vector3(0, 0.645, 0.765)
  pane(b, cabW - 0.16, 0.7, new Vector3(0, 1.26, zW - 0.27).addScaledVector(wsN, 0.062), wsN)
  const rdz = roofBack - cabBase
  const rLen = Math.hypot(rdz, 0.68)
  const rbN = new Vector3(0, rdz / rLen, -0.68 / rLen)
  pane(b, cabW - 0.3, 0.42, new Vector3(0, 1.33, cabBase + rdz * 0.57).addScaledVector(rbN, 0.062), rbN)

  // side windows between the pillars
  const wsZ = (y: number) => zW - (0.54 * (y - 0.94)) / 0.64 - 0.07
  const rbZ = (y: number) => cabBase + (rdz * (y - 0.94)) / 0.68 + 0.12
  const win = (zA: number, zB: number) =>
    new ShapeGeometry(new Shape([
      new Vector2(Math.max(zA, rbZ(1.02)), 1.02), new Vector2(Math.min(zB, wsZ(1.02)), 1.02),
      new Vector2(Math.min(zB, wsZ(1.5)), 1.5), new Vector2(Math.max(zA, rbZ(1.52)), 1.52),
    ]))
  const bPillar = spec.doors === 2 ? zW - 1.15 : zW - 0.96
  const windows: BufferGeometry[] = []
  if (pickup) windows.push(win(cabBase, bPillar - 0.04), win(bPillar + 0.06, zW + 1))
  else if (spec.doors === 4) {
    const cPillar = bPillar - 1.0
    windows.push(win(cabBase, cPillar - 0.05), win(cPillar + 0.05, bPillar - 0.04), win(bPillar + 0.06, zW + 1))
  } else windows.push(win(cabBase, bPillar - 0.05), win(bPillar + 0.06, zW + 1))
  for (const w of windows) {
    w.rotateY(-Math.PI / 2)
    for (const s of [1, -1]) {
      const g = w.clone()
      g.translate(s * (cabW / 2 + 0.006), 0, 0)
      b.add('glass', g)
    }
  }

  // fender flares
  const arcStart = Math.asin((bottom - archYc) / (archR + 0.02))
  const flare = new TorusGeometry(archR + 0.02, 0.07, 5, 16, Math.PI - arcStart * 2)
  flare.rotateZ(arcStart)
  flare.rotateY(Math.PI / 2)
  flare.scale(1.7, 1, 1)
  for (const z of [fz, rz]) for (const s of [1, -1]) b.add('trim', flare, new Matrix4().makeTranslation(s * (hw + 0.005), archYc, z))

  // ---- front end ------------------------------------------------------------------
  b.box('plastic', [1.12, 0.34, 0.06], [0, 0.56, front + 0.03])
  for (const y of [0.46, 0.56, 0.66]) b.box('chrome', [1.02, 0.025, 0.02], [0, y, front + 0.065])
  const headlights: V3[] = []
  for (const s of [1, -1]) {
    b.box('plastic', [0.36, 0.2, 0.04], [s * 0.76, 0.62, front + 0.025])
    b.box('headlight', [0.3, 0.14, 0.04], [s * 0.76, 0.62, front + 0.05])
    b.box('amber', [0.14, 0.06, 0.04], [s * 0.76, 0.48, front + 0.04])
    b.box('red', [0.06, 0.1, 0.1], [s * 0.6, 0.22, front + 0.33])
    headlights.push([s * 0.76, 0.62, front + 0.08])
  }
  b.box('steel', [W + 0.12, 0.26, 0.3], [0, 0.22, front + 0.14])
  b.box('paint', [0.92, 0.04, 0.8], [0, 0.945, (zW + front) / 2 + 0.25], [0.055, 0, 0])
  b.box('steel', [1.1, 0.04, 1.0], [0, -0.03, fz + 0.3])
  if (spec.accessories.bullBar) {
    const z0 = front + 0.26
    for (const s of [1, -1]) {
      b.tube('steel', [s * 0.34, 0.34, z0], [s * 0.34, 0.98, z0 - 0.1], 0.04)
      b.tube('steel', [s * 0.34, 0.75, z0 - 0.05], [s * 0.86, 0.62, z0 - 0.18], 0.035)
      // round spotlights on the bar
      b.disc('steel', 0.12, 0.1, [s * 0.18, 1.04, z0 - 0.11])
      b.disc('headlight', 0.095, 0.02, [s * 0.18, 1.04, z0 - 0.05])
    }
    b.tube('steel', [0.36, 0.98, z0 - 0.1], [-0.36, 0.98, z0 - 0.1], 0.04)
  }

  // ---- rear end ---------------------------------------------------------------------
  b.box('steel', [W + 0.08, 0.22, 0.24], [0, 0.24, rear - 0.12])
  b.tube('chrome', [-0.6, 0.06, rear + 0.12], [-0.6, 0.06, rear - 0.24], 0.04)
  for (const s of [1, -1]) {
    if (pickup) b.box('taillight', [0.075, 0.3, 0.04], [s * (hw - 0.035), 0.8, rear - 0.012])
    else b.box('taillight', [0.12, 0.36, 0.04], [s * (hw - 0.1), 0.72, rear - 0.01])
  }

  // ---- pickup bed / wagon tailgate -------------------------------------------------------
  if (pickup) {
    const bedFront = d.cabBack - 0.02
    const bedLen = bedFront - rear
    const bedMid = (bedFront + rear) / 2
    b.box('bedLiner', [W - 0.14, 0.04, bedLen - 0.06], [0, 0.66, bedMid])
    for (const s of [1, -1]) {
      b.box('paint', [0.07, 0.38, bedLen + 0.02], [s * (hw - 0.035), 0.79, bedMid])
      b.box('plastic', [0.1, 0.03, bedLen + 0.04], [s * (hw - 0.035), 0.995, bedMid])
    }
    b.box('paint', [W, 0.38, 0.07], [0, 0.79, bedFront - 0.035])
    b.box('paint', [W, 0.38, 0.07], [0, 0.79, rear + 0.035])
    if (spec.accessories.rollBar) {
      const zr = bedFront - 0.24
      for (const s of [1, -1]) {
        b.tube('steel', [s * 0.8, 0.98, zr], [s * 0.8, 1.55, zr], 0.04)
        b.tube('steel', [s * 0.8, 1.55, zr], [s * 0.62, 0.98, zr - 0.55], 0.03)
      }
      b.tube('steel', [0.8, 1.55, zr], [-0.8, 1.55, zr], 0.04)
    }
  } else {
    b.box('plastic', [0.004, 0.7, 0.012], [hw - 0.6, 0.6, rear - 0.004])
  }

  // ---- spare wheel -----------------------------------------------------------------------
  const wheel = createWheelGeometries(spec.wheelRadius, spec.wheelWidth)
  const spare = new Matrix4()
  if (spec.accessories.spare === 'bed' && pickup) {
    spare.compose(new Vector3(0, 0.86, (d.cabBack + rear) / 2 - 0.1), new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2)), new Vector3(0.92, 0.92, 0.92))
  } else {
    spare.compose(new Vector3(0, 0.66, rear - 0.2), new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0)), new Vector3(0.95, 0.95, 0.95))
    b.box('steel', [0.5, 0.08, 0.1], [0, 0.66, rear - 0.05])
  }
  b.add('tire', wheel.tire, spare)
  b.add('rim', wheel.rim, spare)
  b.add('rimAccent', wheel.accent, spare)

  // ---- chassis -----------------------------------------------------------------------------
  const frameLen = d.length - 0.35
  for (const s of [1, -1]) b.box('frame', [0.1, 0.18, frameLen], [s * 0.45, 0.02, d.mid])
  b.box('frame', [0.8, 0.12, 0.1], [0, 0.02, fz - 0.55])
  b.box('frame', [0.8, 0.12, 0.1], [0, 0.02, rz + 0.45])
  b.box('frame', [0.4, 0.3, 0.5], [0, -0.02, (fz + rz) / 2 + 0.3])

  // ---- sides: rock sliders, seams, handles, mirrors, antenna ---------------------------------------
  const sliderBack = pickup ? d.cabBack + 0.02 : rz + 0.62
  for (const s of [1, -1]) {
    b.tube('steel', [s * (hw + 0.02), 0.12, sliderBack], [s * (hw + 0.02), 0.12, fz - 0.62], 0.05)
    for (const z of [zW - 0.03, bPillar]) b.box('plastic', [0.004, 0.8, 0.012], [s * (hw + 0.002), 0.55, z])
    b.box('steel', [0.02, 0.04, 0.16], [s * (hw + 0.01), 0.8, bPillar + 0.12])
    b.box('plastic', [0.12, 0.03, 0.03], [s * (cabW / 2 + 0.07), 1.06, zW - 0.14])
    b.box('plastic', [0.05, 0.17, 0.24], [s * (cabW / 2 + 0.14), 1.1, zW - 0.18])
  }
  b.tube('plastic', [hw - 0.08, 0.92, fz + 0.25], [hw - 0.08, 2.15, fz + 0.15], 0.008, 4)

  // ---- snorkel -------------------------------------------------------------------------------
  if (spec.accessories.snorkel) {
    b.tube('plastic', [-(hw + 0.03), 0.55, zW + 0.06], [-(hw + 0.03), 1.66, zW + 0.06], 0.055)
    b.box('plastic', [0.13, 0.13, 0.2], [-(hw + 0.03), 1.71, zW + 0.11])
  }

  // ---- roof rack, light bar, cargo ---------------------------------------------------------------------
  if (spec.accessories.roofRack) {
    const rf = zW - 0.62
    const rb = pickup ? roofBack + 0.05 : rear + 0.25
    const len = rf - rb
    const mid = (rf + rb) / 2
    const rx = cabW / 2 - 0.08
    const y = 1.74
    for (const s of [1, -1]) {
      b.box('frame', [0.05, 0.05, len], [s * rx, y, mid])
      for (const z of [rb + 0.15, rf - 0.15]) b.box('frame', [0.05, 0.08, 0.05], [s * rx, y - 0.06, z])
    }
    for (let i = 0; i <= Math.round(len / 0.45); i++) b.box('frame', [rx * 2, 0.03, 0.04], [0, y - 0.005, rb + (i * len) / Math.round(len / 0.45)])
    b.box('steel', [rx * 2 - 0.1, 0.08, 0.1], [0, y + 0.06, rf - 0.02])
    b.box('lightbar', [rx * 2 - 0.2, 0.05, 0.02], [0, y + 0.06, rf + 0.035])
    // cargo: case(s), jerry can, recovery boards
    const caseLen = Math.min(1.0, len * 0.42)
    b.box('case', [0.85, 0.32, caseLen], [0.32 - 0.12, y + 0.18, rb + caseLen / 2 + 0.1])
    if (len > 2) b.box('case', [0.6, 0.26, 0.55], [0.12, y + 0.15, rb + caseLen + 0.45])
    b.box('red', [0.18, 0.32, 0.36], [-rx + 0.18, y + 0.18, rb + 0.3])
    for (const s of [0, 1]) {
      const bx = -rx + 0.25 + s * 0.36
      const bz = Math.min(rf - 0.7, mid + 0.25)
      b.box('boards', [0.32, 0.04, 1.15], [bx, y + 0.045 + s * 0.045, bz])
      for (let k = 0; k < 5; k++) b.box('boards', [0.26, 0.03, 0.05], [bx, y + 0.075 + s * 0.045, bz - 0.45 + k * 0.22])
    }
  }

  const visual = { parts: b.build(), headlights }
  cache.set(spec.id, visual)
  return visual
}

// ---------------------------------------------------------------------------------------------
// Wheels & suspension
// ---------------------------------------------------------------------------------------------

const wheelCache = new Map<string, { tire: BufferGeometry; rim: BufferGeometry; accent: BufferGeometry }>()

/** Tyre (lathe carcass + tread lugs), rim and beadlock ring. Wheel axis = X, outer face = +X. */
export function createWheelGeometries(R: number, width: number) {
  const key = `${R}:${width}`
  const hit = wheelCache.get(key)
  if (hit) return hit
  const W = width / 2
  const k = R / 0.45
  const profile = [
    [0.27 * k, -W * 0.85], [0.36 * k, -W], [0.42 * k, -W * 0.97], [R - 0.004, -W * 0.72], [R, -W * 0.3],
    [R, W * 0.3], [R - 0.004, W * 0.72], [0.42 * k, W * 0.97], [0.36 * k, W], [0.27 * k, W * 0.85],
  ].map(([r, y]) => new Vector2(r, y))
  const carcass = new LatheGeometry(profile, 32)
  carcass.rotateZ(-Math.PI / 2)
  const tireParts: BufferGeometry[] = [carcass]
  const count = 24
  for (let i = 0; i < count; i++) {
    for (const side of [-1, 1]) {
      const lug = new BoxGeometry(0.13 * k, 0.03, 0.09 * k)
      lug.translate(side * W * 0.45, R + 0.008, 0)
      lug.rotateX(((i + (side > 0 ? 0.5 : 0)) / count) * Math.PI * 2)
      tireParts.push(lug)
    }
    for (const side of [-1, 1]) {
      const blk = new BoxGeometry(0.05, 0.06, 0.07)
      blk.translate(side * (W - 0.01), R - 0.035, 0)
      blk.rotateX(((i + 0.25) / count) * Math.PI * 2)
      tireParts.push(blk)
    }
  }
  const tire = mergeGeometries(tireParts)!
  const rimR = 0.285 * k
  const barrel = new CylinderGeometry(rimR, rimR, width * 0.69, 24, 1, true)
  barrel.rotateZ(-Math.PI / 2)
  barrel.translate(-0.03, 0, 0)
  const face = new CylinderGeometry(rimR - 0.023, rimR - 0.023, 0.025, 24)
  face.rotateZ(-Math.PI / 2)
  face.translate(0.055, 0, 0)
  const hub = new CylinderGeometry(0.075, 0.09, 0.07, 12)
  hub.rotateZ(-Math.PI / 2)
  hub.translate(0.09, 0, 0)
  const rimParts: BufferGeometry[] = [barrel, face, hub]
  for (let i = 0; i < 6; i++) {
    const spoke = new BoxGeometry(0.03, 0.065, rimR * 0.7)
    spoke.translate(0.075, 0, rimR * 0.52)
    spoke.rotateX((i / 6) * Math.PI * 2)
    rimParts.push(spoke)
  }
  const rim = mergeGeometries(rimParts)!
  const ring = new TorusGeometry(rimR, 0.018, 5, 32)
  ring.rotateY(Math.PI / 2)
  ring.translate(0.085, 0, 0)
  const accentParts: BufferGeometry[] = [ring]
  for (let i = 0; i < 12; i++) {
    const bolt = new CylinderGeometry(0.01, 0.01, 0.02, 5)
    bolt.rotateZ(-Math.PI / 2)
    bolt.translate(0.1, rimR, 0)
    bolt.rotateX((i / 12) * Math.PI * 2)
    accentParts.push(bolt)
  }
  const accent = mergeGeometries(accentParts)!
  const out = { tire, rim, accent }
  wheelCache.set(key, out)
  return out
}

/** Helix along Y, unit height, centred at the origin – scaled to the coilover length each frame. */
class Helix extends Curve<Vector3> {
  constructor(private radius: number, private turns: number) {
    super()
  }
  getPoint(t: number, target = new Vector3()) {
    const a = t * Math.PI * 2 * this.turns
    return target.set(Math.cos(a) * this.radius, t - 0.5, Math.sin(a) * this.radius)
  }
}

let suspensionGeo: { unitCylinder: BufferGeometry; spring: BufferGeometry; pumpkin: BufferGeometry } | null = null

export function createSuspensionGeometries() {
  if (suspensionGeo) return suspensionGeo
  const unitCylinder = new CylinderGeometry(1, 1, 1, 8, 1)
  const spring = new TubeGeometry(new Helix(0.075, 7), 120, 0.012, 4, false)
  const pumpkin = new CylinderGeometry(0.17, 0.17, 0.2, 14)
  pumpkin.rotateX(Math.PI / 2)
  suspensionGeo = { unitCylinder, spring, pumpkin }
  return suspensionGeo
}
