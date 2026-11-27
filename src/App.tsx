import { useGameStore } from './game/store'
import { useKeyboardControls } from './game/input'
import { GameCanvas } from './game/GameCanvas'
import { MainMenu } from './ui/MainMenu'
import { SelectScreen } from './ui/SelectScreen'
import { LoadingScreen } from './ui/LoadingScreen'
import { PauseMenu } from './ui/PauseMenu'
import { ResultsScreen } from './ui/ResultsScreen'
import { HUD } from './hud/HUD'
import { TouchControls } from './hud/TouchControls'
import { useTouchMode } from './ui/common'

export default function App() {
  const phase = useGameStore((s) => s.phase)
  const worldReady = useGameStore((s) => s.worldReady)
  const touch = useTouchMode()
  useKeyboardControls()

  const inGame = phase === 'playing' || phase === 'paused' || phase === 'results'
  return (
    <div className={`app ${touch ? 'is-touch' : ''}`}>
      {worldReady && phase !== 'menu' && <GameCanvas />}
      {inGame && <HUD touch={touch} />}
      {inGame && touch && phase === 'playing' && <TouchControls />}
      {phase === 'menu' && <MainMenu />}
      {phase === 'select' && <SelectScreen />}
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'results' && <ResultsScreen />}
    </div>
  )
}
