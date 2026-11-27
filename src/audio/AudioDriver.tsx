import { useFrame } from '@react-three/fiber'
import { engineAudio } from './EngineAudio'
import { telemetry } from '../game/runtime'

/** Feeds the latest vehicle telemetry into the audio engine once per rendered frame. */
export function AudioDriver() {
  useFrame(() => {
    engineAudio.update(telemetry.rpm, telemetry.engineLoad, telemetry.speedKmh, telemetry.slip, !telemetry.outOfFuel)
  })
  return null
}
