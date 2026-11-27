import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { isTouchDevice } from '../game/quality'

/** Touch controls are shown when forced on, or automatically on touch screens. */
export function useTouchMode() {
  const setting = useGameStore((s) => s.touchSetting)
  return setting === 'on' || (setting === 'auto' && isTouchDevice())
}

export function usePortrait() {
  const query = '(orientation: portrait)'
  const [portrait, setPortrait] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setPortrait(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return portrait
}

/** Fullscreen + landscape lock (mobile browsers need a user gesture). */
export async function enterFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
  try {
    if (!document.fullscreenElement) await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await orientation.lock?.('landscape')
  } catch {
    // not supported (e.g. iOS Safari) – the game still works in the browser UI
  }
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen?.()
  else void enterFullscreen()
}

export const fullscreenSupported = () => !!(document.documentElement.requestFullscreen || (document.documentElement as unknown as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen)

type IconName =
  | 'pause' | 'camera' | 'light' | 'help' | 'sound' | 'mute' | 'recover' | 'fullscreen' | 'wrench' | 'fuel'
  | 'sun' | 'moon' | 'flag' | 'timer' | 'arrow' | 'left' | 'right' | 'minus' | 'plus' | 'drive'

const PATHS: Record<IconName, string> = {
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  camera: 'M4 7h3l2-2h6l2 2h3v12H4zM12 9a4 4 0 100 8 4 4 0 000-8z',
  light: 'M9 6a6 6 0 016 6 6 6 0 01-6 6zM3 8h4M3 12h4M3 16h4',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 13v2m0-4c0-3 3-3 3-6a3 3 0 00-6 0',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l6 6m0-6l-6 6',
  recover: 'M20 12a8 8 0 11-3-6.3M20 4v5h-5',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  wrench: 'M14 6a4 4 0 015 5l-9 9-4-4 9-9a4 4 0 01-1-1z',
  fuel: 'M5 4h8v16H5zM13 9h3l2 2v6a2 2 0 01-4 0v-3h-1M7 7h4',
  sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2',
  moon: 'M20 14A8 8 0 1110 4a6 6 0 0010 10z',
  flag: 'M5 21V4h11l-2 4 2 4H7',
  timer: 'M12 7v6l3 2M12 3a9 9 0 100 18 9 9 0 000-18zM10 1h4',
  arrow: 'M12 3l7 9h-4v9H9v-9H5z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  drive: 'M3 12h18M7 7h10M7 17h10',
}

export function Icon({ name, size = '1em', filled = false }: { name: IconName; size?: string; filled?: boolean }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={PATHS[name]} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
