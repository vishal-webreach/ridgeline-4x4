import { useEffect, useState } from 'react'
import { useGameStore } from '../game/store'
import { MenuBackdrop } from './MainMenu'

const TIPS = [
  'LOW range multiplies torque by 2.72 and holds the gear on descents.',
  '2WD drives only the rear wheels – steep grass will spin them.',
  'Stop under the fuel station canopy at base camp to refuel.',
  'Stuck or on your side? Press R to recover in place.',
  'Drag the mouse to look around the truck; scroll to zoom.',
  'The whoops section near the valley trail twists the axles – watch the suspension.',
]

export function LoadingScreen() {
  const progress = useGameStore((s) => s.loadingProgress)
  const label = useGameStore((s) => s.loadingLabel)
  const [tip, setTip] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="screen loading-screen">
      <MenuBackdrop />
      <div className="loading-card">
        <div className="brand small">
          <div className="brand-mark">4×4</div>
          <h2>RIDGELINE</h2>
        </div>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="loading-row">
          <span>{label}</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <p className="loading-tip">{TIPS[tip]}</p>
      </div>
    </div>
  )
}
