import { useEffect, useRef } from 'react'
import { lighting, stageRuntime, telemetry } from '../game/runtime'
import { useGameStore, CAMERA_LABELS } from '../game/store'
import { VEHICLE } from '../vehicle/vehicleConfig'
import { ControlsHelp } from '../ui/ControlsHelp'
import { Icon } from '../ui/common'
import { timeOfDayLabel } from '../environment/Lighting'
import { formatTime } from '../game/stages'

const PSI_MARKS: [string, number][] = [['MUD', 10], ['SAND', 16], ['GRAVEL', 24], ['ROAD', 32]]

/**
 * Driving HUD. Layout is React; live values are written straight into the DOM
 * from a requestAnimationFrame loop reading shared mutable state, so nothing
 * re-renders while driving.
 */
export function HUD({ touch }: { touch: boolean }) {
  const fourWD = useGameStore((s) => s.fourWD)
  const lowRange = useGameStore((s) => s.lowRange)
  const cameraMode = useGameStore((s) => s.cameraMode)
  const toast = useGameStore((s) => s.toast)
  const showHelp = useGameStore((s) => s.showHelp)
  const muted = useGameStore((s) => s.muted)
  const phase = useGameStore((s) => s.phase)
  const stageKey = useGameStore((s) => s.stageKey)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const q = <T extends Element>(sel: string) => el.querySelector<T>(sel)
    const $ = {
      clock: q<HTMLElement>('[data-clock]'),
      tod: q<HTMLElement>('[data-tod]'),
      sun: q<HTMLElement>('[data-sun]'),
      moon: q<HTMLElement>('[data-moon]'),
      timer: q<HTMLElement>('[data-timer]'),
      togo: q<HTMLElement>('[data-togo]'),
      cp: q<HTMLElement>('[data-cp]'),
      arrow: q<HTMLElement>('[data-arrow]'),
      psi: q<HTMLElement>('[data-psi]'),
      psiMarker: q<HTMLElement>('[data-psi-marker]'),
      roll: q<SVGGElement>('[data-roll]'),
      pitch: q<SVGGElement>('[data-pitch]'),
      rollTxt: q<HTMLElement>('[data-roll-txt]'),
      pitchTxt: q<HTMLElement>('[data-pitch-txt]'),
      wheels: [0, 1, 2, 3].map((i) => q<SVGRectElement>(`[data-wheel="${i}"]`)),
      wheelsTxt: q<HTMLElement>('[data-wheels-txt]'),
      fuelBar: q<HTMLElement>('[data-fuel-bar]'),
      fuelRate: q<HTMLElement>('[data-fuel-rate]'),
      dmg: q<HTMLElement>('[data-dmg]'),
      dmgBar: q<HTMLElement>('[data-dmg-bar]'),
      speed: q<HTMLElement>('[data-speed]'),
      rpm: q<HTMLElement>('[data-rpm]'),
      gear: q<HTMLElement>('[data-gear]'),
      knobR: q<SVGCircleElement>('[data-knob-range]'),
      knobG: q<SVGCircleElement>('[data-knob-gear]'),
      tcs: q<HTMLElement>('[data-tcs]'),
      alert: q<HTMLElement>('[data-alert]'),
    }
    const cache: Record<string, string> = {}
    const text = (k: string, node: Element | null, v: string) => {
      if (node && cache[k] !== v) {
        node.textContent = v
        cache[k] = v
      }
    }
    const attr = (k: string, node: Element | null, name: string, v: string) => {
      if (node && cache[k] !== v) {
        node.setAttribute(name, v)
        cache[k] = v
      }
    }
    const style = (k: string, node: HTMLElement | null, prop: 'width' | 'height' | 'left' | 'transform' | 'display', v: string) => {
      if (node && cache[k] !== v) {
        node.style[prop] = v
        cache[k] = v
      }
    }
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const T = telemetry
      // clock
      const h = lighting.hours
      const hh = Math.floor(h)
      const mm = Math.floor((h - hh) * 60)
      text('clock', $.clock, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
      text('tod', $.tod, timeOfDayLabel(h))
      const night = lighting.daylight < 0.3
      style('sun', $.sun, 'display', night ? 'none' : 'inline-block')
      style('moon', $.moon, 'display', night ? 'inline-block' : 'none')
      // stage
      const S = stageRuntime
      if (S.active) {
        text('timer', $.timer, formatTime(S.elapsed))
        text('togo', $.togo, S.distanceToGo > 999 ? `${(S.distanceToGo / 1000).toFixed(2)} km to go` : `${Math.round(S.distanceToGo)} m to go`)
        const total = S.checkpoints.length
        text('cp', $.cp, S.next >= total - 1 ? 'FINISH' : `CP ${S.next + 1}/${total - 1}`)
        const cp = S.checkpoints[S.next]
        if (cp) {
          const rel = Math.atan2(cp.x - T.x, cp.z - T.z) - T.heading
          style('arrow', $.arrow, 'transform', `rotate(${Math.round((-rel * 180) / Math.PI)}deg)`)
        }
      }
      // tyres
      const P = VEHICLE.tirePressure
      text('psi', $.psi, T.tirePressure.toFixed(0))
      style('psim', $.psiMarker, 'left', `${(((T.tirePressure - P.min) / (P.max - P.min)) * 100).toFixed(1)}%`)
      // attitude
      const roll = Math.round(T.roll)
      const pitch = Math.round(T.pitch)
      attr('roll', $.roll, 'transform', `rotate(${-roll} 30 26)`)
      attr('pitch', $.pitch, 'transform', `rotate(${-pitch} 30 26)`)
      text('rollTxt', $.rollTxt, `${Math.abs(roll)}°`)
      text('pitchTxt', $.pitchTxt, `${Math.abs(pitch)}°`)
      let down = 0
      T.wheelsDown.forEach((d, i) => {
        if (d) down++
        attr(`w${i}`, $.wheels[i], 'class', d ? 'wheel down' : 'wheel up')
      })
      text('wheels', $.wheelsTxt, `${down}/4`)
      // right cluster
      style('fuel', $.fuelBar, 'height', `${((T.fuelLiters / T.fuelCapacity) * 100).toFixed(1)}%`)
      attr('fuelLow', $.fuelBar, 'class', T.fuelLiters / T.fuelCapacity < 0.15 ? 'fuel-fill low' : 'fuel-fill')
      text('fuelRate', $.fuelRate, T.fuelRate.toFixed(1))
      text('dmg', $.dmg, `${Math.round(T.damage * 100)}`)
      style('dmgBar', $.dmgBar, 'width', `${(T.damage * 100).toFixed(0)}%`)
      text('speed', $.speed, `${Math.round(Math.abs(T.speedKmh))}`)
      style('rpm', $.rpm, 'width', `${Math.min(100, (T.rpm / VEHICLE.engine.limiterRpm) * 100).toFixed(1)}%`)
      attr('rpmRed', $.rpm, 'class', T.rpm > VEHICLE.engine.redlineRpm ? 'rpm-fill red' : 'rpm-fill')
      text('gear', $.gear, T.shifting ? '·' : T.gear === -1 ? 'R' : `D${T.gear}`)
      attr('knobG', $.knobG, 'cy', T.gear === -1 ? '50' : T.shifting ? '33' : '16')
      attr('tcs', $.tcs, 'class', T.tcsActive ? 'mode-chip tcs active' : 'mode-chip tcs')
      // alerts
      const alert = T.outOfFuel
        ? 'OUT OF FUEL — pause and restart'
        : T.flipped
          ? 'ON ITS SIDE — recover the truck'
          : T.refueling || T.repairing
            ? `${T.refueling ? 'REFUELING' : ''}${T.refueling && T.repairing ? ' · ' : ''}${T.repairing ? 'REPAIRING' : ''}`
            : T.fuelLiters / T.fuelCapacity < 0.12
              ? 'LOW FUEL'
              : ''
      text('alert', $.alert, alert)
      style('alertD', $.alert, 'display', alert ? 'block' : 'none')
      attr('alertC', $.alert, 'class', T.refueling || T.repairing ? 'hud-alert good' : 'hud-alert')
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [stageKey])

  const store = useGameStore.getState
  const stageActive = stageRuntime.active
  return (
    <div ref={root} className={`hud ${touch ? 'touch' : 'desktop'} ${phase !== 'playing' ? 'dimmed' : ''}`}>
      {/* top-left: menu buttons */}
      <div className="hud-tl">
        <button className="icon-btn" onClick={() => store().pause()} title="Pause (Esc)"><Icon name="pause" /></button>
        <button className="icon-btn" onClick={() => store().cycleCamera()} title={`${CAMERA_LABELS[cameraMode]} (C)`}><Icon name="camera" /></button>
        <button className="icon-btn" onClick={() => store().toggleHeadlights()} title="Headlights (N)"><Icon name="light" /></button>
        <button className="icon-btn" onClick={() => store().recoverVehicle()} title="Recover (R)"><Icon name="recover" /></button>
        <button className="icon-btn" onClick={() => store().toggleMute()} title="Sound (M)"><Icon name={muted ? 'mute' : 'sound'} /></button>
        <button className="icon-btn" onClick={() => store().toggleHelp()} title="Controls (H)"><Icon name="help" /></button>
      </div>

      {/* top-centre: clock + stage */}
      <div className="hud-tc">
        <div className="pill clock">
          <span data-sun><Icon name="sun" /></span>
          <span data-moon style={{ display: 'none' }}><Icon name="moon" /></span>
          <b data-clock>08:00</b>
          <small data-tod>MORNING</small>
        </div>
        {stageActive && (
          <div className="pill stage">
            <span className="arrow" data-arrow><Icon name="arrow" filled /></span>
            <b data-timer>0:00.0</b>
            <small data-togo>— m to go</small>
            <span className="cp" data-cp>CP 1</span>
          </div>
        )}
      </div>

      {toast && <div key={toast.id} className={`hud-toast ${toast.tone}`}>{toast.text}</div>}
      <div data-alert className="hud-alert" style={{ display: 'none' }} />

      {/* bottom-left: tyres + attitude */}
      <div className="hud-bl">
        <div className="panel tyres">
          <div className="panel-head"><span>TYRES</span>{!touch && <kbd>Q</kbd>}{!touch && <kbd>E</kbd>}</div>
          <div className="psi"><b data-psi>30</b><small>psi</small></div>
          <div className="psi-scale">
            <div className="psi-track" />
            <div className="psi-marker" data-psi-marker />
            <div className="psi-labels">{PSI_MARKS.map(([l]) => <span key={l}>{l}</span>)}</div>
          </div>
        </div>
        <div className="panel attitude">
          <div className="att">
            <small>ROLL</small>
            <svg viewBox="0 0 60 44"><g data-roll><path className="truck-shape" d="M16 30 h28 v-10 l-5 -7 h-18 l-5 7 z" /><rect className="tyre" x="14" y="28" width="7" height="9" rx="2" /><rect className="tyre" x="39" y="28" width="7" height="9" rx="2" /></g></svg>
            <b data-roll-txt>0°</b>
          </div>
          <div className="att">
            <small>PITCH</small>
            <svg viewBox="0 0 60 44"><g data-pitch><path className="truck-shape" d="M8 30 h44 v-9 h-11 l-5 -8 h-12 v8 h-16 z" /><circle className="tyre" cx="17" cy="33" r="5" /><circle className="tyre" cx="43" cy="33" r="5" /></g></svg>
            <b data-pitch-txt>0°</b>
          </div>
          <div className="att">
            <small>WHEELS</small>
            <svg viewBox="0 0 40 52">
              <rect className="chassis" x="15" y="8" width="10" height="36" rx="2" />
              <rect className="axle" x="6" y="12" width="28" height="3" />
              <rect className="axle" x="6" y="37" width="28" height="3" />
              {[[2, 6], [30, 6], [2, 32], [30, 32]].map(([x, y], i) => (
                <rect key={i} data-wheel={i} className="wheel down" x={x} y={y} width="8" height="14" rx="2" />
              ))}
            </svg>
            <b><span className={`badge-drive ${fourWD ? 'on' : ''}`}>{fourWD ? '4WD' : '2WD'}</span> <span data-wheels-txt>4/4</span></b>
          </div>
        </div>
      </div>

      {/* bottom-right: fuel, damage, speed, gear */}
      <div className="hud-br">
        <div className="panel gauges">
          <div className="fuel-col">
            <small>F</small>
            <div className="fuel-tube"><div data-fuel-bar className="fuel-fill" /></div>
            <small>E</small>
            <span className="fuel-rate"><b data-fuel-rate>0.0</b> L/h</span>
          </div>
          <div className="dmg-col">
            <span className="dmg-icon"><Icon name="wrench" /></span>
            <b><span data-dmg>0</span>%</b>
            <div className="dmg-track"><div data-dmg-bar /></div>
            <small>DAMAGE</small>
          </div>
        </div>
        <div className="panel drive">
          <div className="speed-box">
            <small>SPEED</small>
            <div><b data-speed>0</b><small> km/h</small></div>
            <div className="rpm-track"><div data-rpm className="rpm-fill" /></div>
            <div className="drive-row">
              <span className="gear" data-gear>D1</span>
              <span data-tcs className="mode-chip tcs">TCS</span>
            </div>
          </div>
          <div className="gate">
            <svg viewBox="0 0 60 66">
              <rect className="slot" x="10" y="12" width="8" height="42" rx="4" />
              <rect className="slot" x="40" y="12" width="8" height="42" rx="4" />
              <rect className="slot" x="14" y="29" width="30" height="8" rx="4" />
              <text x="3" y="20">H</text>
              <text x="3" y="54">L</text>
              <text x="51" y="20">A</text>
              <text x="51" y="37">N</text>
              <text x="51" y="54">R</text>
              <circle data-knob-range className="knob" cx="14" cy={lowRange ? 50 : 16} r="6" />
              <circle data-knob-gear className="knob" cx="44" cy="16" r="6" />
            </svg>
            <span className={`range ${lowRange ? 'low' : ''}`}>{lowRange ? 'LOW' : 'HIGH'}</span>
          </div>
        </div>
      </div>

      {showHelp && phase === 'playing' && (
        <div className="hud-help panel">
          <ControlsHelp touch={touch} />
          <button className="btn small" onClick={() => store().toggleHelp()}>Close</button>
        </div>
      )}
    </div>
  )
}
