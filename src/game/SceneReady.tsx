import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Object3D } from 'three'
import { useGameStore } from './store'
import { perf, useRenderDpr } from './perf'
import { PROFILES } from './quality'

/**
 * Mounted inside the physics world while the loading screen is still up:
 *  1. compiles every shader and renders the whole scene once with culling off,
 *     so geometry/texture uploads happen now, not as hitches mid-drive;
 *  2. benchmarks ~1.5 s of real frames and picks the starting resolution, so the
 *     game opens at a smooth frame rate instead of adapting while you drive;
 *  3. leaves the loading screen.
 */
export function SceneReady() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const st = useRef({ warmed: false, t: 0, samples: [] as number[], done: false, settle: 0 })

  useEffect(() => {
    gl.compile(scene, camera)
    const culled: Object3D[] = []
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      if (o.frustumCulled) {
        culled.push(o)
        o.frustumCulled = false
      }
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    gl.render(scene, camera)
    culled.forEach((o) => (o.frustumCulled = true))
    hidden.forEach((o) => (o.visible = false))
    st.current.warmed = true
  }, [gl, scene, camera])

  useFrame((_, dt) => {
    const s = st.current
    const store = useGameStore.getState()
    if (!s.warmed || s.done || store.phase !== 'loading') return
    // wall-clock time since warm-up (each frame counted at most 1 s) – guarantees the
    // loading screen always finishes, even on a device that renders very slowly
    s.t += Math.min(dt, 1)
    if (s.settle > 0) {
      s.settle -= Math.min(dt, 1)
      if (s.settle <= 0) {
        s.done = true
        store.sceneReady()
      }
      return
    }
    if (s.t < 0.4) return // the first frames include the shader compile
    if (dt <= 0.25) s.samples.push(dt)
    const enough = (s.t >= 1.9 && s.samples.length >= 30) || s.t >= 6
    if (!enough) return
    // median frame time: one-off stalls (component mounting, GC) don't count;
    // with almost no usable frames the device is very slow
    const sorted = [...s.samples].sort((a, b) => a - b)
    const fps = sorted.length >= 5 ? 1 / Math.max(1e-3, sorted[Math.floor(sorted.length / 2)]) : 8
    perf.fps = fps
    const profile = PROFILES[store.worldTier ?? store.tier]
    const ceiling = Math.min(profile.dprMax, window.devicePixelRatio || 1)
    // scale the pixel count toward ~60 fps with a little headroom (fps ∝ 1 / pixels ∝ 1 / dpr²)
    const target = fps >= 58 ? ceiling : Math.max(profile.dprMin, Math.min(ceiling, ceiling * Math.sqrt(fps / 64)))
    if (target < ceiling - 0.01) useRenderDpr.getState().setDpr(target)
    s.settle = 0.5 // let the resize happen behind the loading screen
  })
  return null
}
