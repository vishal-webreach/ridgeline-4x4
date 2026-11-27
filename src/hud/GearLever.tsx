import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { useGameStore } from '../game/store'
import { vehicleRefs } from '../vehicle/vehicleRefs'

/**
 * Draggable gear lever. Manual: 5-4-3-2-1-N-R (drag or X / Z). Automatic:
 * D-N-R. Tap a label to jump there. Buttons switch automatic/manual and the
 * HIGH/LOW transfer case.
 */
export function GearLever() {
  const transmission = useGameStore((s) => s.transmission)
  const lowRange = useGameStore((s) => s.lowRange)
  const manual = transmission === 'manual'
  const slots = manual ? [5, 4, 3, 2, 1, 0, -1] : [1, 0, -1]
  const labels = slots.map((g) => (g === -1 ? 'R' : g === 0 ? 'N' : manual ? String(g) : 'D'))
  const track = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const drag = useRef<{ active: boolean; idx: number }>({ active: false, idx: 0 })
  const st = useGameStore.getState

  const slotFromY = (clientY: number) => {
    const r = track.current!.getBoundingClientRect()
    const t = (clientY - r.top) / r.height
    return Math.max(0, Math.min(slots.length - 1, Math.round(t * (slots.length - 1))))
  }
  const placeKnob = (idx: number) => {
    if (knob.current) knob.current.style.top = `${(idx / (slots.length - 1)) * 100}%`
  }

  // follow the actual gear (auto shifts, keyboard shifts) when not dragging
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (drag.current.active) return
      const d = vehicleRefs.controller?.drivetrain
      if (!d) return
      const g = d.leverGear
      const idx = slots.indexOf(manual ? g : g >= 1 ? 1 : g)
      if (idx >= 0) placeKnob(idx)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [manual]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: RPointerEvent) => {
    e.preventDefault()
    track.current!.setPointerCapture(e.pointerId)
    drag.current = { active: true, idx: slotFromY(e.clientY) }
    placeKnob(drag.current.idx)
  }
  const onMove = (e: RPointerEvent) => {
    if (!drag.current.active) return
    drag.current.idx = slotFromY(e.clientY)
    placeKnob(drag.current.idx)
  }
  const onUp = () => {
    if (!drag.current.active) return
    drag.current.active = false
    st().setGear(slots[drag.current.idx])
  }

  return (
    <div className="lever">
      <div className="lever-mode">
        <button className={manual ? '' : 'on'} onClick={() => st().toggleTransmission()} title="Automatic / manual (T)">{manual ? 'M' : 'A'}</button>
        <button className={lowRange ? 'on warn' : ''} onClick={() => st().toggleLowRange()} title="Transfer case (L)">{lowRange ? 'L' : 'H'}</button>
      </div>
      <div className="lever-gate" style={{ height: `${slots.length * 1.25 + 1.4}rem` }}>
        <div className="lever-labels">
          {labels.map((l, i) => (
            <span
              key={i}
              style={{ top: `${(i / (slots.length - 1)) * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation()
                st().setGear(slots[i])
              }}
            >
              {l}
            </span>
          ))}
        </div>
        <div ref={track} className="lever-track" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div ref={knob} className="lever-knob" />
        </div>
      </div>
    </div>
  )
}
