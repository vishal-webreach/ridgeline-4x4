import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { ControlsHelp } from './ControlsHelp'
import { SettingsPanel } from './MainMenu'
import { perf } from '../game/perf'
import { getStage } from '../game/stages'
import { QUALITY_LABELS } from '../game/quality'
import { useTouchMode } from './common'

export function PauseMenu() {
  const s = useGameStore.getState
  const tier = useGameStore((st) => st.worldTier ?? st.tier)
  const stageId = useGameStore((st) => st.stageId)
  const touch = useTouchMode()
  const [panel, setPanel] = useState<'none' | 'controls' | 'settings'>('none')
  const [stats, setStats] = useState({ fps: perf.fps, dpr: perf.dpr })
  useEffect(() => {
    const id = setInterval(() => setStats({ fps: perf.fps, dpr: perf.dpr }), 500)
    return () => clearInterval(id)
  }, [])
  const stage = getStage(stageId)

  return (
    <div className="screen pause-screen">
      <div className="pause-card">
        <h2>Paused</h2>
        <p className="pause-sub">{stage.name}</p>
        <div className="menu-buttons">
          <button className="btn primary" onClick={() => s().resume()}>Resume</button>
          <button className="btn" onClick={() => s().restartVehicle()}>{stage.route ? 'Restart stage' : 'Back to base camp'}</button>
          <button className="btn" onClick={() => s().recoverVehicle()}>Recover vehicle</button>
          <button className="btn" onClick={() => s().openSelect()}>Change trail / truck</button>
          <button className={`btn ${panel === 'settings' ? 'active' : ''}`} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>Settings</button>
          <button className={`btn ${panel === 'controls' ? 'active' : ''}`} onClick={() => setPanel(panel === 'controls' ? 'none' : 'controls')}>Controls</button>
          <button className="btn danger" onClick={() => s().toMainMenu()}>Main menu</button>
        </div>
        {panel === 'controls' && <ControlsHelp touch={touch} />}
        {panel === 'settings' && (
          <>
            <SettingsPanel />
            <p className="setting-note">A new graphics level applies the next time a trail loads from the main menu.</p>
          </>
        )}
        <p className="pause-note">
          {QUALITY_LABELS[tier]} graphics · {Math.round(stats.fps)} fps · resolution {Math.round(stats.dpr * 100)}%
        </p>
      </div>
    </div>
  )
}
