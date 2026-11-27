import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { VehicleController } from './VehicleController'
import { VEHICLE } from './vehicleConfig'
import { TruckModel } from './TruckModel'
import { RunningGear } from './RunningGear'
import { BlobShadow } from './BlobShadow'
import { vehicleRefs } from './vehicleRefs'
import { applyTruck, bodyDims, getTruck } from './trucks'
import { getWorld } from '../environment/worldState'
import { PHYSICS_DT } from '../physics/constants'
import { useGameStore } from '../game/store'
import type { QualityProfile } from '../game/quality'

/**
 * The playable truck: a dynamic Rapier rigid body (body + cab colliders sized
 * from the truck spec) whose wheels are simulated by the raycast
 * VehicleController before every fixed physics step.
 */
export function Vehicle({ profile }: { profile: QualityProfile }) {
  const truckId = useGameStore((s) => s.truckId)
  const spec = getTruck(truckId)
  applyTruck(spec) // must run before the controller / running gear read VEHICLE
  const { rapier } = useRapier()
  const controller = useMemo(() => new VehicleController(rapier), [rapier, spec]) // eslint-disable-line react-hooks/exhaustive-deps
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const spawn = getWorld().spawn
  const d = bodyDims(spec)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    // colliders have zero density: mass, centre of mass and inertia are set explicitly
    const { mass, centerOfMass, inertia } = VEHICLE
    body.setAdditionalMassProperties(mass, centerOfMass, inertia, { x: 0, y: 0, z: 0, w: 1 }, true)
    controller.drivetrain.reset(true)
    vehicleRefs.body = body
    vehicleRefs.object = visualRef.current
    vehicleRefs.controller = controller
    return () => {
      vehicleRefs.body = null
      vehicleRefs.object = null
      vehicleRefs.controller = null
    }
  }, [controller])

  useBeforePhysicsStep((world) => {
    const body = bodyRef.current
    if (body) controller.step(world, body, PHYSICS_DT)
  })

  const C = VEHICLE.chassis
  const cabFront = d.windshieldBase
  const cabBack = d.cabBack
  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={[spawn.x, spawn.y + 1.25, spawn.z]}
        rotation={[0, spawn.yaw, 0]}
        canSleep={false}
        ccd
        linearDamping={C.linearDamping}
        angularDamping={C.angularDamping}
      >
        {/* lower body / frame (bumper to bumper) */}
        <CuboidCollider
          args={[spec.bodyWidth / 2, 0.36, d.length / 2 + 0.2]}
          position={[0, 0.3, d.mid + 0.12]}
          density={0}
          friction={C.friction}
          restitution={C.restitution}
        />
        {/* cab */}
        <CuboidCollider
          args={[(spec.bodyWidth - 0.22) / 2, 0.36, (cabFront - cabBack) / 2]}
          position={[0, 1.28, (cabFront + cabBack) / 2 - 0.1]}
          density={0}
          friction={C.friction}
          restitution={C.restitution}
        />
        <group ref={visualRef}>
          <TruckModel spec={spec} headlightCount={profile.headlights} />
          <RunningGear controller={controller} />
        </group>
      </RigidBody>
      {!profile.shadows && <BlobShadow length={d.length} width={spec.bodyWidth} />}
    </>
  )
}
