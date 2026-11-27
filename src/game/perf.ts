import { create } from 'zustand'

/** Live performance numbers (shown in the pause menu). */
export const perf = { fps: 60, dpr: 1 }

/**
 * Render pixel ratio chosen by the adaptive resolution system. The Canvas
 * reads it as its `dpr` prop (R3F re-applies that prop on every configure,
 * so it has to be the source of truth).
 */
export const useRenderDpr = create<{ dpr: number | null; setDpr: (d: number) => void }>()((set) => ({
  dpr: null,
  setDpr: (dpr) => set({ dpr }),
}))
