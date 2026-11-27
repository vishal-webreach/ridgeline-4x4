import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Optional frame-rate cap (Settings → FPS limit). With a cap, R3F's own loop is
 * switched off and frames are advanced from requestAnimationFrame only when the
 * interval has elapsed. Physics keeps its fixed 60 Hz step regardless.
 */
export function FrameLimiter({ fps }: { fps: number }) {
  const setFrameloop = useThree((s) => s.setFrameloop)
  const advance = useThree((s) => s.advance)

  useEffect(() => {
    if (!fps) {
      setFrameloop('always')
      return
    }
    setFrameloop('never')
    const interval = 1000 / fps
    let next = performance.now()
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      // allow ~1 ms of jitter so a 60 cap on a 60 Hz display renders every frame
      if (t < next - 1) return
      next = Math.max(next + interval, t - interval)
      // with frameloop 'never' R3F measures delta against clock.elapsedTime, which is in seconds
      advance(t / 1000)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      setFrameloop('always')
    }
  }, [fps, setFrameloop, advance])

  return null
}
