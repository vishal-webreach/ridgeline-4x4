import { useGameStore } from '../game/store'
import { formatTime, getStage } from '../game/stages'

export function ResultsScreen() {
  const result = useGameStore((s) => s.result)
  const s = useGameStore.getState
  if (!result) return null
  const stage = getStage(result.stageId)
  return (
    <div className="screen pause-screen">
      <div className="pause-card results">
        <p className="results-kicker">TRAIL COMPLETE</p>
        <h2>{stage.name}</h2>
        <div className="results-time">{formatTime(result.time)}</div>
        {result.newBest ? <div className="badge good">New best time!</div> : <div className="badge">Best {formatTime(result.best)}</div>}
        <div className="results-row">
          <span>Damage</span>
          <b>{Math.round(result.damage * 100)}%</b>
        </div>
        <div className="menu-buttons">
          <button className="btn primary" onClick={() => s().nextStage()}>Next trail</button>
          <button className="btn" onClick={() => s().retryStage()}>Retry</button>
          <button className="btn" onClick={() => s().openSelect()}>Choose trail / truck</button>
          <button className="btn danger" onClick={() => s().toMainMenu()}>Main menu</button>
        </div>
      </div>
    </div>
  )
}
