import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { engineAudio } from './EngineAudio'
import { telemetry, weather } from '../game/runtime'

/** Feeds the latest vehicle telemetry and weather into the audio engine once per rendered frame. */
export function AudioDriver() {
  const lastFlash = useRef(0)
  useFrame(() => {
    engineAudio.update(telemetry.rpm, telemetry.engineLoad, telemetry.speedKmh, telemetry.slip, !telemetry.outOfFuel)
    engineAudio.setRain(weather.rain)
    // thunder follows each lightning flash after a short delay
    if (weather.flash > 0.9 && lastFlash.current <= 0.9) engineAudio.thunder(0.4 + Math.random() * 1.6)
    lastFlash.current = weather.flash
  })
  return null
}
