import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { perf, useRenderDpr } from './perf'
import { useGameStore } from './store'

/**
 * Dynamic resolution: measures the frame rate every second and lowers the
 * pixel ratio when frames drop below ~50 fps, raising it again after a few
 * seconds of headroom. Keeps the game smooth on slow GPUs and high-DPI phones.
 */
export function AdaptiveResolution({ min, max, cap = 0 }: { min: number; max: number; cap?: number }) {
  // judge smoothness against the frame-rate cap when one is set
  const target = cap > 0 ? Math.min(cap, 60) : 60
  const setDpr = useRenderDpr((s) => s.setDpr)
  const ceiling = Math.min(max, window.devicePixelRatio || 1)
  const st = useRef({ dpr: ceiling, t: 0, frames: 0, good: 0, bad: 0, cooldown: 0, warmup: 3 })

  useEffect(() => {
    st.current.dpr = ceiling
    setDpr(ceiling)
    perf.dpr = ceiling
  }, [ceiling, setDpr])

  // the loading-screen benchmark (SceneReady) may already have picked a starting value
  useEffect(
    () =>
      useRenderDpr.subscribe((state) => {
        if (state.dpr !== null && Math.abs(state.dpr - st.current.dpr) > 0.001) {
          st.current.dpr = state.dpr
          perf.dpr = state.dpr
        }
      }),
    [],
  )

  useFrame((_, dt) => {
    const s = st.current
    s.t += dt
    s.frames++
    if (s.t < 1) return
    const fps = s.frames / s.t
    perf.fps = fps
    s.t = 0
    s.frames = 0
    // ignore the first seconds (shader warm-up / loading hitches) and background tabs
    const phase = useGameStore.getState().phase
    if (phase === 'loading') {
      // loading frames are dominated by setup work – never judge the GPU on them
      s.bad = s.good = 0
      s.warmup = 3
      return
    }
    if (document.hidden || s.warmup-- > 0) return
    // every change resizes the canvas, so act rarely: 2 s of low fps to step
    // down, and at least 5 s between changes
    s.cooldown = Math.max(0, s.cooldown - 1)
    s.bad = fps < target * 0.78 ? s.bad + 1 : 0
    s.good = fps > target * 0.96 ? s.good + 1 : 0
    if (s.cooldown > 0) return
    if (s.bad >= 2 && s.dpr > min + 0.01) {
      s.dpr = Math.max(min, s.dpr - (fps < target * 0.55 ? 0.25 : 0.12))
      setDpr(s.dpr)
      s.bad = 0
      s.cooldown = 5
    } else if (s.good >= 3 && s.dpr < ceiling - 0.01 && phase !== 'playing') {
      // stepping up resizes the canvas (a visible hitch on some GPUs), so only do it while paused / in menus
      s.dpr = Math.min(ceiling, s.dpr + 0.1)
      setDpr(s.dpr)
      s.good = 0
      s.cooldown = 5
    }
    perf.dpr = s.dpr
  })
  return null
}
