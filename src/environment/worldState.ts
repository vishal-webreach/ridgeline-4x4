import type { WorldData } from './worldGen'

/** The currently loaded world (set once generation finishes). */
let current: WorldData | null = null

export const setCurrentWorld = (w: WorldData | null) => {
  current = w
}

export const hasWorld = () => current !== null

export const getWorld = (): WorldData => {
  if (!current) throw new Error('World has not been generated yet')
  return current
}
