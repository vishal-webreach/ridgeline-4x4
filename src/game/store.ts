import { create } from 'zustand'
import { generateWorld } from '../environment/worldGen'
import { getWorld, hasWorld, setCurrentWorld } from '../environment/worldState'
import { lighting, stageRuntime, telemetry, vehicleCommands } from './runtime'
import { engineAudio } from '../audio/EngineAudio'
import { resolveTier, isTouchDevice, type QualitySetting, type QualityTier } from './quality'
import { STAGES, buildRoute, getStage, loadBestTimes, makeCheckpoints, saveBestTime } from './stages'
import { applyTruck, getTruck, type TruckId } from '../vehicle/trucks'
import { VEHICLE } from '../vehicle/vehicleConfig'

export type Phase = 'menu' | 'select' | 'loading' | 'playing' | 'paused' | 'results'
export type CameraMode = 'chase' | 'hood' | 'orbit' | 'cinematic'
export const CAMERA_MODES: CameraMode[] = ['chase', 'hood', 'orbit', 'cinematic']
export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase cam',
  hood: 'Hood cam',
  orbit: 'Free orbit',
  cinematic: 'Cinematic',
}
export type TouchSetting = 'auto' | 'on' | 'off'

/** Transfer case may only be shifted between HIGH and LOW below this speed. */
export const LOW_RANGE_MAX_SHIFT_KMH = 8

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'warn' | 'good'
}

export interface StageResult {
  stageId: string
  time: number
  best: number
  newBest: boolean
  damage: number
}

interface GameState {
  phase: Phase
  qualitySetting: QualitySetting
  tier: QualityTier
  /** tier the currently generated world was built for */
  worldTier: QualityTier | null
  touchSetting: TouchSetting
  worldReady: boolean
  loadingProgress: number
  loadingLabel: string
  cameraMode: CameraMode
  fourWD: boolean
  lowRange: boolean
  muted: boolean
  showHelp: boolean
  toast: Toast | null
  stageId: string
  truckId: TruckId
  result: StageResult | null
  bestTimes: Record<string, number>
  /** bumps whenever a stage (re)starts – remounts the checkpoint gates */
  stageKey: number

  setQuality: (q: QualitySetting) => void
  setTouchSetting: (t: TouchSetting) => void
  setStage: (id: string) => void
  setTruck: (id: TruckId) => void
  openSelect: () => void
  startStage: () => Promise<void>
  sceneReady: () => void
  finishStage: (time: number) => void
  retryStage: () => void
  nextStage: () => void
  pause: () => void
  resume: () => void
  togglePause: () => void
  toMainMenu: () => void
  cycleCamera: () => void
  toggle4WD: () => void
  toggleLowRange: () => void
  toggleMute: () => void
  toggleHelp: () => void
  toggleHeadlights: () => void
  showToast: (text: string, tone?: Toast['tone']) => void
  recoverVehicle: () => void
  restartVehicle: () => void
}

let toastId = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined

const SETTINGS_KEY = 'ridgeline.settings'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<{ quality: QualitySetting; touch: TouchSetting; muted: boolean; truck: TruckId }>
  } catch {
    return {}
  }
})()
const persist = (s: GameState) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: s.qualitySetting, touch: s.touchSetting, muted: s.muted, truck: s.truckId }))
  } catch {
    // ignore
  }
}

/** Puts the truck at the start of the selected stage and resets the stage clock. */
function prepareStage(stageId: string) {
  const world = getWorld()
  const stage = getStage(stageId)
  const route = buildRoute(world.roads, stage)
  lighting.hours = stage.startHour
  lighting.manualHeadlights = null
  telemetry.damage = 0
  telemetry.tirePressure = VEHICLE.tirePressure.default
  Object.assign(stageRuntime, {
    active: !!route, running: !!route, finished: false, elapsed: 0, next: 0, progressIndex: 0,
    total: route?.total ?? 0, distanceToGo: route?.total ?? 0,
    pts: route?.pts ?? new Float32Array(0), cum: route?.cum ?? new Float32Array(0),
    checkpoints: route ? makeCheckpoints(route, world.terrain) : [],
  })
  if (route) {
    const k = Math.min(4, route.pts.length / 2 - 1)
    const yaw = Math.atan2(route.pts[k * 2] - route.pts[0], route.pts[k * 2 + 1] - route.pts[1])
    vehicleCommands.placeAt = { x: route.pts[0], z: route.pts[1], yaw, refuel: true }
  } else {
    const s = world.spawn
    vehicleCommands.placeAt = { x: s.x, z: s.z, yaw: s.yaw, refuel: true }
  }
  vehicleCommands.recover = false
  vehicleCommands.restart = false
}

export const useGameStore = create<GameState>()((set, get) => ({
  phase: 'menu',
  qualitySetting: saved.quality ?? 'auto',
  tier: resolveTier(saved.quality ?? 'auto'),
  worldTier: null,
  touchSetting: saved.touch ?? 'auto',
  worldReady: false,
  loadingProgress: 0,
  loadingLabel: '',
  cameraMode: 'chase',
  fourWD: true,
  lowRange: false,
  muted: saved.muted ?? false,
  showHelp: false,
  toast: null,
  stageId: STAGES[0].id,
  truckId: saved.truck ?? 'ridgeback',
  result: null,
  bestTimes: loadBestTimes(),
  stageKey: 0,

  setQuality: (qualitySetting) => {
    set({ qualitySetting, tier: resolveTier(qualitySetting) })
    persist(get())
  },
  setTouchSetting: (touchSetting) => {
    set({ touchSetting })
    persist(get())
  },
  setStage: (stageId) => set({ stageId }),
  setTruck: (truckId) => {
    set({ truckId })
    persist(get())
  },

  openSelect: () => {
    const p = get().phase
    if (p === 'menu' || p === 'paused' || p === 'results' || p === 'playing') {
      if (p === 'playing') engineAudio.suspend()
      set({ phase: 'select', showHelp: false })
    }
  },

  startStage: async () => {
    const st = get()
    if (st.phase !== 'select') return
    engineAudio.start() // must happen inside the tap / click gesture
    engineAudio.setMuted(st.muted)
    applyTruck(getTruck(st.truckId))
    set({ cameraMode: 'chase', fourWD: true, lowRange: false, showHelp: false, toast: null, result: null })

    // world already loaded for this quality tier: start immediately
    if (st.worldReady && st.worldTier === st.tier && hasWorld()) {
      prepareStage(st.stageId)
      set({ phase: 'playing', stageKey: get().stageKey + 1 })
      engineAudio.resume()
      return
    }

    set({ phase: 'loading', loadingProgress: 0, loadingLabel: 'Preparing…', worldReady: false })
    try {
      const world = await generateWorld(st.tier, (p, label) => set({ loadingProgress: p, loadingLabel: label }))
      if (get().phase !== 'loading') return
      setCurrentWorld(world)
      prepareStage(get().stageId)
      set({ stageKey: get().stageKey + 1, worldReady: true, worldTier: st.tier, loadingProgress: 0.9, loadingLabel: 'Compiling shaders and starting physics…' })
    } catch (err) {
      console.error(err)
      set({ phase: 'select', loadingLabel: '' })
      get().showToast('World generation failed – see console', 'warn')
    }
  },

  sceneReady: () => {
    if (get().phase !== 'loading') return
    set({ phase: 'playing', loadingProgress: 1 })
    get().showToast(isTouchDevice() ? 'Tap ? for controls' : 'Press H for controls')
  },

  finishStage: (time) => {
    const { stageId } = get()
    const newBest = saveBestTime(stageId, time)
    const bestTimes = loadBestTimes()
    set({
      phase: 'results',
      bestTimes,
      result: { stageId, time, best: bestTimes[stageId] ?? time, newBest, damage: telemetry.damage },
    })
  },

  retryStage: () => {
    prepareStage(get().stageId)
    set({ phase: 'playing', result: null, lowRange: false, fourWD: true, stageKey: get().stageKey + 1 })
    engineAudio.resume()
  },

  nextStage: () => {
    const i = STAGES.findIndex((s) => s.id === get().stageId)
    const next = STAGES[(i + 1) % STAGES.length]
    set({ stageId: next.id })
    get().retryStage()
  },

  pause: () => {
    if (get().phase !== 'playing') return
    set({ phase: 'paused' })
    engineAudio.suspend()
  },
  resume: () => {
    if (get().phase !== 'paused') return
    set({ phase: 'playing' })
    engineAudio.resume()
  },
  togglePause: () => (get().phase === 'paused' ? get().resume() : get().pause()),

  toMainMenu: () => {
    engineAudio.stop()
    set({ phase: 'menu', worldReady: false, showHelp: false, toast: null, result: null })
  },

  cycleCamera: () => {
    const i = CAMERA_MODES.indexOf(get().cameraMode)
    const next = CAMERA_MODES[(i + 1) % CAMERA_MODES.length]
    set({ cameraMode: next })
    get().showToast(CAMERA_LABELS[next])
  },

  toggle4WD: () => {
    const { fourWD, lowRange } = get()
    if (fourWD && lowRange) {
      get().showToast('Shift out of LOW range before selecting 2WD', 'warn')
      return
    }
    set({ fourWD: !fourWD })
    get().showToast(!fourWD ? '4WD engaged' : '2WD – rear wheel drive')
  },

  toggleLowRange: () => {
    if (Math.abs(telemetry.speedKmh) > LOW_RANGE_MAX_SHIFT_KMH) {
      get().showToast(`Slow below ${LOW_RANGE_MAX_SHIFT_KMH} km/h to shift the transfer case`, 'warn')
      return
    }
    const low = !get().lowRange
    set({ lowRange: low, fourWD: low ? true : get().fourWD })
    get().showToast(low ? 'LOW range engaged (4L)' : 'HIGH range')
  },

  toggleMute: () => {
    const muted = !get().muted
    engineAudio.setMuted(muted)
    set({ muted })
    persist(get())
    get().showToast(muted ? 'Sound off' : 'Sound on')
  },

  toggleHelp: () => set({ showHelp: !get().showHelp }),

  toggleHeadlights: () => {
    lighting.manualHeadlights = !lighting.headlightsOn
    get().showToast(lighting.manualHeadlights ? 'Headlights on' : 'Headlights off')
  },

  showToast: (text, tone = 'info') => {
    const id = ++toastId
    set({ toast: { id, text, tone } })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 2200)
  },

  recoverVehicle: () => {
    vehicleCommands.recover = true
    get().resume()
    get().showToast('Vehicle recovered')
  },

  restartVehicle: () => {
    set({ lowRange: false, fourWD: true })
    get().retryStage()
    get().showToast(stageRuntime.active ? 'Stage restarted' : 'Back at base camp – tank refilled')
  },
}))
