import { createRoot } from 'react-dom/client'
import App from './App'
import { lighting, stageRuntime, telemetry, weather, winch } from './game/runtime'
import { useGameStore } from './game/store'
import { vehicleRefs } from './vehicle/vehicleRefs'
import { getWorld } from './environment/worldState'
import { sampleHeight } from './environment/terrainGenerator'
import { perf, useRenderDpr } from './game/perf'
import './styles.css'

// dev-only debug handle (inspect in the browser console: __game.telemetry)
if (import.meta.env.DEV) Object.assign(window, { __game: { telemetry, store: useGameStore, vehicle: vehicleRefs, getWorld, sampleHeight, perf, renderDpr: useRenderDpr, lighting, stage: stageRuntime, weather, winch } })

createRoot(document.getElementById('root')!).render(<App />)
