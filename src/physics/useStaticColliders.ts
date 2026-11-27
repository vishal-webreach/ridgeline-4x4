import { useEffect } from 'react'
import { useRapier } from '@react-three/rapier'
import type * as RAPIER from '@dimforge/rapier3d-compat'
import { registerSurface, unregisterSurface } from './surfaces'
import type { RapierModule } from './rapierTypes'
import type { Surface } from '../environment/worldConfig'

export interface StaticColliderSpec {
  desc: RAPIER.ColliderDesc
  /** tyre friction for this collider, or 'terrain' to sample the splat map */
  surface: Surface | 'terrain'
}

/**
 * Creates one fixed rigid body holding many colliders, directly through the
 * Rapier API. Much cheaper than mounting thousands of React collider
 * components for trees and rocks.
 */
export function useStaticColliders(build: (rapier: RapierModule) => StaticColliderSpec[], deps: unknown[]) {
  const { world, rapier } = useRapier()
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    const handles: number[] = []
    for (const spec of build(rapier)) {
      const collider = world.createCollider(spec.desc, body)
      registerSurface(collider.handle, spec.surface)
      handles.push(collider.handle)
    }
    return () => {
      handles.forEach(unregisterSurface)
      try {
        world.removeRigidBody(body)
      } catch {
        // the physics world may already have been disposed on unmount
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, rapier, ...deps])
}
