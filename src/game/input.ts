import { useEffect } from 'react'
import { useGameStore } from './store'

/** Held driving keys, polled by the vehicle controller every physics step. */
export const driveInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  handbrake: false,
  deflate: false,
  inflate: false,
}

type DriveKey = keyof typeof driveInput

const DRIVE_KEYS: Record<string, DriveKey> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  KeyQ: 'deflate',
  KeyE: 'inflate',
}

function releaseAll() {
  for (const k of Object.keys(driveInput) as DriveKey[]) driveInput[k] = false
}

/** Attaches global keyboard listeners for driving + one-shot actions. */
export function useKeyboardControls() {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const st = useGameStore.getState()
      const drive = DRIVE_KEYS[e.code]
      if (drive) {
        driveInput[drive] = true
        if (st.phase === 'playing') e.preventDefault()
        return
      }
      if (e.repeat) return
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (st.phase === 'playing' || st.phase === 'paused') st.togglePause()
        return
      }
      if (st.phase !== 'playing') return
      switch (e.code) {
        case 'KeyC': st.cycleCamera(); break
        case 'KeyR': st.recoverVehicle(); break
        case 'KeyL': st.toggleLowRange(); break
        case 'KeyF': st.toggle4WD(); break
        case 'KeyM': st.toggleMute(); break
        case 'KeyH': st.toggleHelp(); break
        case 'KeyN': st.toggleHeadlights(); break
        default: return
      }
      e.preventDefault()
    }
    const onUp = (e: KeyboardEvent) => {
      const drive = DRIVE_KEYS[e.code]
      if (drive) driveInput[drive] = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [])
}
