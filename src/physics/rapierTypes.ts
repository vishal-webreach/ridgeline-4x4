import type { useRapier } from '@react-three/rapier'

/** The Rapier module namespace as exposed by @react-three/rapier (after WASM init). */
export type RapierModule = ReturnType<typeof useRapier>['rapier']
