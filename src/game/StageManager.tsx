import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, Color, MeshStandardMaterial, MeshBasicMaterial, SRGBColorSpace, type Group, type Mesh } from 'three'
import { stageRuntime } from './runtime'
import { useGameStore } from './store'
import { vehicleRefs } from '../vehicle/vehicleRefs'

const GATE_RADIUS = 11

/**
 * Tracks the timed stage: elapsed time, distance-to-go along the route,
 * checkpoints passed in order, and the finish.
 */
export function StageManager() {
  const stageKey = useGameStore((s) => s.stageKey)
  useFrame((_, dt) => {
    const S = stageRuntime
    const body = vehicleRefs.body
    const st = useGameStore.getState()
    if (!S.active || S.finished || !body || st.phase !== 'playing') return
    S.elapsed += Math.min(dt, 0.1)
    const p = body.translation()

    // progress along the route (local search around the last index)
    const n = S.cum.length
    if (n > 1) {
      let best = S.progressIndex
      let bestD = Infinity
      const scan = (lo: number, hi: number) => {
        for (let i = lo; i <= hi; i++) {
          const d = (S.pts[i * 2] - p.x) ** 2 + (S.pts[i * 2 + 1] - p.z) ** 2
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
      }
      scan(Math.max(0, S.progressIndex - 12), Math.min(n - 1, S.progressIndex + 50))
      if (bestD > 35 * 35) scan(0, n - 1)
      S.progressIndex = best
      // never count progress beyond the next checkpoint the driver still has to reach
      const cap = S.checkpoints[S.next]?.at ?? S.total
      S.distanceToGo = Math.max(0, S.total - Math.min(S.cum[best], cap))
    }

    const cp = S.checkpoints[S.next]
    if (cp && Math.hypot(p.x - cp.x, p.z - cp.z) < GATE_RADIUS && Math.abs(p.y - cp.y) < 8) {
      S.next++
      if (S.next >= S.checkpoints.length) {
        S.finished = true
        S.running = false
        S.distanceToGo = 0
        st.finishStage(S.elapsed)
      } else {
        st.showToast(`Checkpoint ${S.next} / ${S.checkpoints.length - 1}`, 'good')
      }
    }
  })
  return <CheckpointGates key={stageKey} />
}

let checkerTex: CanvasTexture | null = null
function checker() {
  if (checkerTex) return checkerTex
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 32
  const ctx = c.getContext('2d')!
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'
    ctx.fillRect(i * 16, j * 16, 16, 16)
  }
  checkerTex = new CanvasTexture(c)
  checkerTex.colorSpace = SRGBColorSpace
  return checkerTex
}

const COLORS = { next: new Color('#ff9a1f'), passed: new Color('#3fae5c'), future: new Color('#d9dcd6') }

/** Gate posts + banner at every checkpoint; a light beam marks the next one. */
function CheckpointGates() {
  const cps = stageRuntime.checkpoints
  const banners = useRef<(Mesh | null)[]>([])
  const groups = useRef<(Group | null)[]>([])
  const beam = useRef<Mesh>(null)
  const mats = useMemo(
    () => cps.map((_, i) => (i === cps.length - 1
      ? new MeshStandardMaterial({ map: checker(), emissive: '#ffffff', emissiveIntensity: 0.25 })
      : new MeshStandardMaterial({ color: '#d9dcd6', emissive: '#000000', roughness: 0.6 }))),
    [cps],
  )
  const beamMat = useMemo(() => new MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, fog: false }), [])

  useFrame(({ clock }) => {
    const next = stageRuntime.next
    const pulse = 0.6 + Math.sin(clock.elapsedTime * 5) * 0.4
    cps.forEach((_, i) => {
      const m = mats[i]
      const g = groups.current[i]
      if (g) g.visible = i >= next - 1
      if (i === cps.length - 1) return
      if (i < next) {
        m.color.copy(COLORS.passed)
        m.emissive.setRGB(0, 0, 0)
      } else if (i === next) {
        m.color.copy(COLORS.next)
        m.emissive.copy(COLORS.next).multiplyScalar(pulse * 0.6)
      } else {
        m.color.copy(COLORS.future)
        m.emissive.setRGB(0, 0, 0)
      }
    })
    const target = cps[next]
    if (beam.current) {
      beam.current.visible = !!target && !stageRuntime.finished
      if (target) beam.current.position.set(target.x, target.y + 20, target.z)
    }
  })

  if (!cps.length) return null
  return (
    <group>
      {cps.map((cp, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g }} position={[cp.x, cp.y, cp.z]} rotation={[0, cp.yaw, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 4.6, 1.7, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.11, 3.4, 8]} />
              <meshStandardMaterial color="#2a2c30" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
          <mesh ref={(m) => { banners.current[i] = m }} position={[0, 3.25, 0]} material={mats[i]}>
            <boxGeometry args={[9.4, 0.6, 0.06]} />
          </mesh>
        </group>
      ))}
      <mesh ref={beam} material={beamMat}>
        <cylinderGeometry args={[0.6, 0.6, 40, 12, 1, true]} />
      </mesh>
    </group>
  )
}
