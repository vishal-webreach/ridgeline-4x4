import type { ReactNode } from 'react'
import { Physics } from '@react-three/rapier'
import { GRAVITY, PHYSICS_DT } from './constants'

/**
 * Rapier world with a fixed timestep. Rendering interpolates between steps,
 * so physics stays deterministic at 60 Hz regardless of monitor refresh rate.
 */
export function PhysicsWorld({ paused, children }: { paused: boolean; children: ReactNode }) {
  return (
    <Physics timeStep={PHYSICS_DT} gravity={GRAVITY} paused={paused} interpolate colliders={false} debug={false}>
      {children}
    </Physics>
  )
}
