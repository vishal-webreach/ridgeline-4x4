import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { useGameStore } from '../game/store'
import { vehicleRefs } from '../vehicle/vehicleRefs'
import { getWorld } from '../environment/worldState'
import { sampleHeight } from '../environment/terrainGenerator'
import { telemetry } from '../game/runtime'
import { FoliageIndex } from './FoliageIndex'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const dampAngle = (a: number, b: number, lambda: number, dt: number) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt))

const CHASE = { pitch: 0.3, distance: 9.5, minDist: 4, maxDist: 26, height: 1.4 }
const HOOD_OFFSET = new Vector3(0, 1.62, 0.98)

/**
 * Third-person camera: smoothly follows the truck's heading, mouse drag
 * orbits, wheel zooms, and a physics ray from the truck to the camera pulls
 * it in front of terrain/trees/rocks. Also hood, free-orbit and cinematic modes.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const { world, rapier } = useRapier()
  const mode = useGameStore((s) => s.cameraMode)
  const foliage = useMemo(() => new FoliageIndex(getWorld().trees), [])

  const st = useRef({
    heading: 0,
    userYaw: 0,
    userPitch: 0,
    orbitYaw: 0,
    distance: CHASE.distance,
    smoothDist: CHASE.distance,
    lastInput: -100,
    dragging: false,
    lastX: 0,
    lastY: 0,
    initialised: false,
    cinePos: new Vector3(),
    cineValid: false,
    cineBlocked: 0,
  })
  const v = useMemo(
    () => ({
      target: new Vector3(),
      look: new Vector3(),
      dir: new Vector3(),
      fwd: new Vector3(),
      desired: new Vector3(),
      quat: new Quaternion(),
      tmpQ: new Quaternion(),
      vel: new Vector3(),
      ray: new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
    }),
    [rapier],
  )

  // mouse orbit + zoom
  useEffect(() => {
    const el = gl.domElement
    const s = st.current
    // pointers on the canvas: one = orbit, two = pinch zoom
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)
      s.dragging = pointers.size === 1
      s.lastX = e.clientX
      s.lastY = e.clientY
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch > 0 && d > 0) s.distance = clamp((s.distance * pinch) / d, CHASE.minDist, CHASE.maxDist)
        pinch = d
        s.lastInput = performance.now() / 1000
        return
      }
      if (!s.dragging) return
      const dx = e.clientX - s.lastX
      const dy = e.clientY - s.lastY
      s.lastX = e.clientX
      s.lastY = e.clientY
      const k = e.pointerType === 'touch' ? 0.009 : 0.006
      s.userYaw -= dx * k
      s.orbitYaw -= dx * k
      s.userPitch = clamp(s.userPitch + dy * k * 0.7, -0.45, 1.05)
      s.lastInput = performance.now() / 1000
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinch = 0
      s.dragging = pointers.size === 1
      const rest = [...pointers.values()][0]
      if (rest) {
        s.lastX = rest.x
        s.lastY = rest.y
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      s.distance = clamp(s.distance * (e.deltaY > 0 ? 1.1 : 1 / 1.1), CHASE.minDist, CHASE.maxDist)
      s.lastInput = performance.now() / 1000
    }
    const onContext = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContext)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContext)
    }
  }, [gl])

  // reset per-mode offsets when switching
  useEffect(() => {
    const s = st.current
    s.userYaw = 0
    s.userPitch = 0
    s.cineValid = false
    s.orbitYaw = s.heading + Math.PI
  }, [mode])

  useFrame((_, rawDt) => {
    const obj = vehicleRefs.object
    const body = vehicleRefs.body
    if (!obj) return
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const terrain = getWorld().terrain

    obj.getWorldPosition(v.target)
    obj.getWorldQuaternion(v.quat)
    v.fwd.set(0, 0, 1).applyQuaternion(v.quat)
    const heading = Math.atan2(v.fwd.x, v.fwd.z)
    if (!s.initialised) {
      s.heading = heading
      s.orbitYaw = heading + Math.PI
      s.initialised = true
    }
    s.heading = dampAngle(s.heading, heading, 3.2, dt)
    const now = performance.now() / 1000

    if (mode === 'hood') {
      camera.position.copy(HOOD_OFFSET).applyQuaternion(v.quat).add(v.target)
      // camera looks down -Z; the truck faces +Z
      v.tmpQ.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI + s.userYaw)
      camera.quaternion.copy(v.quat).multiply(v.tmpQ)
      v.tmpQ.setFromAxisAngle(new Vector3(1, 0, 0), 0.07 - s.userPitch * 0.6)
      camera.quaternion.multiply(v.tmpQ)
      if (!s.dragging && now - s.lastInput > 1.5) {
        s.userYaw = damp(s.userYaw, 0, 3, dt)
        s.userPitch = damp(s.userPitch, 0, 3, dt)
      }
      camera.fov = damp(camera.fov, 72, 4, dt)
      camera.near = 0.05
      camera.updateProjectionMatrix()
      return
    }
    camera.near = 0.1

    v.look.copy(v.target)
    v.look.y += CHASE.height

    if (mode === 'cinematic') {
      if (body) {
        const lv = body.linvel()
        v.vel.set(lv.x, 0, lv.z)
      }
      const far = s.cinePos.distanceTo(v.target) > 48
      if (!s.cineValid || far || s.cineBlocked > 1.2) {
        const dir = v.vel.lengthSq() > 4 ? v.vel.clone().normalize() : v.fwd.clone().setY(0).normalize()
        const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1)
        s.cinePos.copy(v.target).addScaledVector(dir, 28).addScaledVector(side, 9 + Math.random() * 8)
        s.cinePos.y = sampleHeight(terrain, s.cinePos.x, s.cinePos.z) + 1.6 + Math.random() * 3
        s.cineValid = true
        s.cineBlocked = 0
      }
      // occlusion check
      v.dir.subVectors(s.cinePos, v.look)
      const d = v.dir.length()
      v.dir.divideScalar(d)
      v.ray.origin = { x: v.look.x, y: v.look.y, z: v.look.z }
      v.ray.dir = { x: v.dir.x, y: v.dir.y, z: v.dir.z }
      const hit = world.castRay(v.ray, d, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body ?? undefined)
      s.cineBlocked = hit ? s.cineBlocked + dt : 0
      camera.position.copy(s.cinePos)
      camera.lookAt(v.look)
      camera.fov = damp(camera.fov, clamp(20 + d * 0.9, 25, 60), 3, dt)
      camera.updateProjectionMatrix()
      return
    }

    // chase / orbit
    if (mode === 'chase' && !s.dragging && now - s.lastInput > 1.6) {
      s.userYaw = damp(s.userYaw, 0, 1.8, dt)
      s.userPitch = damp(s.userPitch, 0, 1.2, dt)
    }
    const yaw = mode === 'orbit' ? s.orbitYaw : s.heading + Math.PI + s.userYaw
    const pitch = clamp(CHASE.pitch + s.userPitch, -0.15, 1.35)
    v.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))

    // collision avoidance: pull the camera in front of anything between it and the truck
    let allowed = s.distance
    v.ray.origin = { x: v.look.x, y: v.look.y, z: v.look.z }
    v.ray.dir = { x: v.dir.x, y: v.dir.y, z: v.dir.z }
    const hit = world.castRay(v.ray, s.distance + 0.5, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body ?? undefined)
    if (hit) allowed = Math.max(1.6, hit.timeOfImpact - 0.45)
    allowed = Math.min(allowed, Math.max(1.6, foliage.clip(v.look, v.dir, s.distance) - 0.4))
    s.smoothDist = allowed < s.smoothDist ? damp(s.smoothDist, allowed, 25, dt) : damp(s.smoothDist, allowed, 2.5, dt)

    v.desired.copy(v.look).addScaledVector(v.dir, s.smoothDist)
    const ground = sampleHeight(terrain, v.desired.x, v.desired.z) + 0.6
    if (v.desired.y < ground) v.desired.y = ground
    camera.position.copy(v.desired)
    camera.lookAt(v.look)
    const speedFov = 58 + clamp(Math.abs(telemetry.speedKmh) / 120, 0, 1) * 12
    camera.fov = damp(camera.fov, speedFov, 3, dt)
    camera.updateProjectionMatrix()
  })

  return null
}
