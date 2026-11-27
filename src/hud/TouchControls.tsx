import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { touchInput } from '../game/runtime'
import { useGameStore } from '../game/store'
import { Icon } from '../ui/common'

type Hold = 'left' | 'right' | 'gas' | 'brake' | 'hb' | 'down' | 'up'

/**
 * On-screen controls for phones and tablets. Every button tracks its own
 * pointer (multi-touch: steer with the left thumb while holding the pedal
 * with the right). Values feed the same input path as the keyboard.
 */
export function TouchControls() {
  const fourWD = useGameStore((s) => s.fourWD)
  const lowRange = useGameStore((s) => s.lowRange)
  const held = useRef(new Set<Hold>())
  // never leave a pedal stuck down when the controls disappear (pause, results)
  useEffect(() => () => {
    held.current.clear()
    Object.assign(touchInput, { steer: 0, throttle: 0, brake: 0, handbrake: false, inflate: false, deflate: false })
  }, [])

  const sync = () => {
    const h = held.current
    touchInput.steer = (h.has('left') ? 1 : 0) - (h.has('right') ? 1 : 0)
    touchInput.throttle = h.has('gas') ? 1 : 0
    touchInput.brake = h.has('brake') ? 1 : 0
    touchInput.handbrake = h.has('hb')
    touchInput.deflate = h.has('down')
    touchInput.inflate = h.has('up')
  }

  const hold = (k: Hold) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      held.current.add(k)
      ;(e.currentTarget as HTMLElement).classList.add('pressed')
      navigator.vibrate?.(8)
      sync()
    },
    onPointerUp: (e: RPointerEvent) => release(e, k),
    onPointerCancel: (e: RPointerEvent) => release(e, k),
    onLostPointerCapture: (e: RPointerEvent) => release(e, k),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
  const release = (e: RPointerEvent, k: Hold) => {
    held.current.delete(k)
    ;(e.currentTarget as HTMLElement).classList.remove('pressed')
    sync()
  }
  const tap = (fn: () => void) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      navigator.vibrate?.(8)
      fn()
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
  const st = useGameStore.getState

  return (
    <div className="touch-ui">
      <div className="touch-steer">
        <button className="tbtn steer" aria-label="Steer left" {...hold('left')}><Icon name="left" /></button>
        <button className="tbtn steer" aria-label="Steer right" {...hold('right')}><Icon name="right" /></button>
      </div>

      <div className="touch-actions">
        <button className={`tbtn small ${fourWD ? 'on' : ''}`} {...tap(() => st().toggle4WD())}>{fourWD ? '4WD' : '2WD'}</button>
        <button className={`tbtn small ${lowRange ? 'on warn' : ''}`} {...tap(() => st().toggleLowRange())}>{lowRange ? 'LOW' : 'HIGH'}</button>
        <div className="psi-btns">
          <button className="tbtn small" aria-label="Deflate tyres" {...hold('down')}>PSI <Icon name="minus" /></button>
          <button className="tbtn small" aria-label="Inflate tyres" {...hold('up')}>PSI <Icon name="plus" /></button>
        </div>
      </div>

      <div className="touch-pedals">
        <button className="tbtn hb" {...hold('hb')}>HB</button>
        <button className="tbtn pedal brake" {...hold('brake')}>BRAKE</button>
        <button className="tbtn pedal gas" {...hold('gas')}>GAS</button>
      </div>
    </div>
  )
}
