import { useMemo, useState } from 'react'
import { useGameStore } from '../game/store'
import { ROAM_STARTS, STAGES, formatTime, stageLengthKm, type Difficulty } from '../game/stages'
import { TIME_FLOWS } from '../game/store'
import { WEATHER_LABELS } from '../game/weather'
import { Segmented } from './MainMenu'
import type { WeatherType } from '../game/runtime'
import { TRUCKS, getTruck, type TruckSpec } from '../vehicle/trucks'
import { MenuBackdrop } from './MainMenu'
import { enterFullscreen, useTouchMode } from './common'

const DIFF_CLASS: Record<Difficulty, string> = { Easy: 'easy', Medium: 'medium', Hard: 'hard', Extreme: 'extreme' }

function hourLabel(h: number) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Side-view silhouette of a truck in its paint colour. */
export function TruckSilhouette({ spec }: { spec: TruckSpec }) {
  const wb = (spec.frontAxle - spec.rearAxle) * 40
  const cx = 150
  const fx = cx + wb / 2
  const rx = cx - wb / 2
  const r = spec.wheelRadius * 40
  const front = fx + 44
  const rear = rx - (spec.body === 'pickup' ? 47 : 39)
  const cabRear = spec.body === 'pickup' ? fx - 24 - 69 : rear + 4
  return (
    <svg viewBox="0 0 300 120" className="truck-sil" aria-hidden>
      <path d={`M${rear} 82 L${rear} 52 L${cabRear} 50 L${cabRear + 3} 24 L${fx - 45} 22 L${fx - 22} 48 L${front - 4} 52 L${front} 82 Z`} fill={spec.paint} stroke="#0008" strokeWidth="1.5" />
      {spec.body === 'pickup' && <rect x={rear} y={50} width={cabRear - rear} height={6} fill="#0005" />}
      <path d={`M${cabRear + 8} 28 L${fx - 47} 27 L${fx - 28} 47 L${cabRear + 8} 47 Z`} fill="#1a242c" />
      {spec.accessories.roofRack && <rect x={cabRear + 6} y={14} width={fx - 50 - cabRear} height={6} rx={2} fill="#222" />}
      {spec.accessories.roofRack && <rect x={cabRear + 12} y={10} width={30} height={5} fill="#f07a1a" />}
      {[fx, rx].map((x) => (
        <g key={x}>
          <circle cx={x} cy={88} r={r} fill="#161616" />
          <circle cx={x} cy={88} r={r * 0.55} fill="#3a3c40" />
        </g>
      ))}
    </svg>
  )
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <div className="stat-track"><div style={{ width: `${value * 100}%` }} /></div>
    </div>
  )
}

function hourText(h: number) {
  const hh = Math.floor(h)
  return `${String(hh).padStart(2, '0')}:${String(Math.round((h - hh) * 60)).padStart(2, '0')}`
}

/** Options for Custom Roam: where, when, weather and rules. */
function CustomRoamPanel() {
  const c = useGameStore((s) => s.custom)
  const set = useGameStore((s) => s.setCustom)
  return (
    <div className="custom-panel" onClick={(e) => e.stopPropagation()}>
      <h3>Custom Roam setup</h3>
      <label className="custom-row">
        <span>Start at</span>
        <select value={c.start} onChange={(e) => set({ start: e.target.value })}>
          {ROAM_STARTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="custom-row">
        <span>Time of day <b>{hourText(c.hour)}</b></span>
        <input type="range" min={0} max={23.75} step={0.25} value={c.hour} onChange={(e) => set({ hour: Number(e.target.value) })} />
      </label>
      <div className="custom-row">
        <span>Clock</span>
        <Segmented<string> value={String(c.timeScale)} options={TIME_FLOWS.map((t) => String(t.scale))} labels={Object.fromEntries(TIME_FLOWS.map((t) => [String(t.scale), t.label]))} onChange={(v) => set({ timeScale: Number(v) })} />
      </div>
      <div className="custom-row">
        <span>Weather</span>
        <Segmented<WeatherType> value={c.weather} options={['clear', 'fog', 'rain', 'storm']} labels={WEATHER_LABELS} onChange={(weather) => set({ weather })} />
      </div>
      <div className="custom-row">
        <span>Fuel</span>
        <Segmented<'inf' | 'real'> value={c.infiniteFuel ? 'inf' : 'real'} options={['inf', 'real']} labels={{ inf: 'Unlimited', real: 'Realistic' }} onChange={(v) => set({ infiniteFuel: v === 'inf' })} />
      </div>
      <div className="custom-row">
        <span>Damage</span>
        <Segmented<'on' | 'off'> value={c.damage ? 'on' : 'off'} options={['on', 'off']} labels={{ on: 'On', off: 'Off' }} onChange={(v) => set({ damage: v === 'on' })} />
      </div>
    </div>
  )
}

/** Step 1: pick a trail. Step 2: pick a truck. Then drive. */
export function SelectScreen() {
  const stageId = useGameStore((s) => s.stageId)
  const truckId = useGameStore((s) => s.truckId)
  const setStage = useGameStore((s) => s.setStage)
  const setTruck = useGameStore((s) => s.setTruck)
  const startStage = useGameStore((s) => s.startStage)
  const toMainMenu = useGameStore((s) => s.toMainMenu)
  const bestTimes = useGameStore((s) => s.bestTimes)
  const worldReady = useGameStore((s) => s.worldReady)
  const touch = useTouchMode()
  const [step, setStep] = useState<1 | 2>(1)
  const lengths = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id, stageLengthKm(s)])), [])
  const stage = STAGES.find((s) => s.id === stageId)!
  const truck = getTruck(truckId)

  const go = () => {
    if (touch) void enterFullscreen()
    void startStage()
  }

  return (
    <div className={`screen select-screen ${worldReady ? 'over-game' : ''}`}>
      {!worldReady && <MenuBackdrop />}
      <div className="select-card">
        <header className="steps">
          <button className={`step ${step === 1 ? 'on' : ''}`} onClick={() => setStep(1)}>
            <span className="step-n">1</span>
            <span><small>TRAIL</small>{stage.name}</span>
          </button>
          <button className={`step ${step === 2 ? 'on' : ''}`} onClick={() => setStep(2)}>
            <span className="step-n">2</span>
            <span><small>TRUCK</small>{truck.name}</span>
          </button>
          <button className="btn small ghost" onClick={toMainMenu}>Menu</button>
        </header>

        {step === 1 ? (
          <div className="card-list">
            {STAGES.map((s) => (
              <button key={s.id} className={`stage-card ${s.id === stageId ? 'on' : ''}`} onClick={() => setStage(s.id)}>
                <div className="stage-tags">
                  <span className={`diff ${DIFF_CLASS[s.difficulty]}`}>{s.route ? s.difficulty : 'Free'}</span>
                  {lengths[s.id] !== null && <span className="chip">{lengths[s.id]!.toFixed(1)} km</span>}
                  <span className="chip">{hourLabel(s.startHour)}</span>
                  {bestTimes[s.id] !== undefined && <span className="chip best">Best {formatTime(bestTimes[s.id])}</span>}
                </div>
                <h3>{s.name}</h3>
                <p className="stage-region">{s.region}</p>
                {s.id === stageId && <p className="stage-desc">{s.description} <em>Suggested tyres: {s.psi} psi.</em></p>}
                {s.weather !== 'clear' && <span className="chip weather">{WEATHER_LABELS[s.weather]}</span>}
              </button>
            ))}
            {stageId === 'custom' && <CustomRoamPanel />}
          </div>
        ) : (
          <div className="card-list trucks">
            {TRUCKS.map((t) => (
              <button key={t.id} className={`truck-card ${t.id === truckId ? 'on' : ''}`} onClick={() => setTruck(t.id)}>
                <TruckSilhouette spec={t} />
                <h3>{t.name}</h3>
                <p className="stage-region">{t.tagline}</p>
                <StatBar label="Power" value={t.stats.power} />
                <StatBar label="Weight" value={t.stats.weight} />
                <StatBar label="Articulation" value={t.stats.articulation} />
                <StatBar label="Agility" value={t.stats.agility} />
              </button>
            ))}
          </div>
        )}

        <footer className="select-footer">
          {step === 1 ? (
            <button className="btn primary" onClick={() => setStep(2)}>Next: choose a truck</button>
          ) : (
            <button className="btn primary" onClick={go}>Drive {stage.name}</button>
          )}
          {step === 2 && <button className="btn ghost" onClick={() => setStep(1)}>Back</button>}
        </footer>
      </div>
    </div>
  )
}
