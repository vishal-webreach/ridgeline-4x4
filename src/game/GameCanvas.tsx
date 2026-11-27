import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping } from 'three'
import { useGameStore } from './store'
import { getWorld } from '../environment/worldState'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { EnvironmentScene } from '../environment/EnvironmentScene'
import { Vehicle } from '../vehicle/Vehicle'
import { CameraRig } from '../camera/CameraRig'
import { AudioDriver } from '../audio/AudioDriver'
import { SceneReady } from './SceneReady'
import { StageManager } from './StageManager'
import { AdaptiveResolution } from './AdaptiveResolution'
import { PROFILES } from './quality'
import { useRenderDpr } from './perf'
import { FrameLimiter } from './FrameLimiter'
import { WinchVisual } from '../vehicle/WinchVisual'

/**
 * Game engine root: WebGL canvas, fixed-step physics world, environment,
 * vehicle, camera and stage logic. React only re-renders here when the game
 * phase, truck or camera mode changes – never per physics step.
 */
export function GameCanvas() {
  const phase = useGameStore((s) => s.phase)
  const tier = useGameStore((s) => s.worldTier ?? s.tier)
  const truckId = useGameStore((s) => s.truckId)
  const fpsCap = useGameStore((s) => s.fpsCap)
  const profile = PROFILES[tier]
  // adaptive pixel ratio (see AdaptiveResolution); before the first measurement use the tier's range
  const adaptiveDpr = useRenderDpr((s) => s.dpr)
  const world = getWorld()
  const spawn = world.spawn

  // memoised so a pixel-ratio change only resizes the canvas instead of
  // re-rendering the whole scene graph (which would e.g. re-bake the sky map)
  const contents = useMemo(
    () => (
      <>
        <AdaptiveResolution min={profile.dprMin} max={profile.dprMax} cap={fpsCap} />
        <FrameLimiter fps={fpsCap} />
        <Suspense fallback={null}>
          <PhysicsWorld paused={phase !== 'playing'}>
            <EnvironmentScene world={world} profile={profile} />
            <Vehicle key={truckId} profile={profile} />
            <StageManager />
            <WinchVisual />
            <CameraRig />
            <SceneReady />
          </PhysicsWorld>
        </Suspense>
        <AudioDriver />
      </>
    ),
    [phase, profile, truckId, world, fpsCap],
  )

  // stable prop objects: R3F re-applies camera / gl options whenever they change identity
  const cameraProps = useMemo(
    () => ({ fov: 60, near: 0.1, far: profile.cameraFar, position: [spawn.x - Math.sin(spawn.yaw) * 10, spawn.y + 5, spawn.z - Math.cos(spawn.yaw) * 10] as [number, number, number] }),
    [profile, spawn],
  )
  const glProps = useMemo(
    () => ({ antialias: profile.antialias, powerPreference: 'high-performance' as const, toneMapping: ACESFilmicToneMapping, stencil: false }),
    [profile],
  )

  return (
    <Canvas
      className="game-canvas"
      shadows={profile.shadows ? (profile.shadowType === 'pcf' ? 'percentage' : 'basic') : false}
      dpr={adaptiveDpr ?? [profile.dprMin, profile.dprMax]}
      gl={glProps}
      camera={cameraProps}
      onCreated={(state) => {
        if (import.meta.env.DEV) Object.assign((window as unknown as { __game: object }).__game, { three: state })
      }}
    >
      {contents}
    </Canvas>
  )
}
