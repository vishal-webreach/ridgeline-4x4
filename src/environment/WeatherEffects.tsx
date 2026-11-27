import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Color, Float32BufferAttribute, LineSegments, ShaderMaterial } from 'three'
import { mulberry32 } from './noise'
import { weather } from '../game/runtime'
import { updateWeather } from '../game/weather'
import { useGameStore } from '../game/store'

const BOX = 36
const HEIGHT = 24

/**
 * Rain: thousands of streaks in a box that wraps around the camera, animated
 * entirely on the GPU (one draw call, no per-frame CPU work). Intensity hides
 * a share of the drops.
 */
export function WeatherEffects({ drops }: { drops: number }) {
  const rain = useMemo(() => {
    const rand = mulberry32(99)
    const pos = new Float32Array(drops * 2 * 3)
    const tip = new Float32Array(drops * 2)
    for (let i = 0; i < drops; i++) {
      const x = rand() * BOX
      const y = rand() * HEIGHT
      const z = rand() * BOX
      pos.set([x, y, z, x, y, z], i * 6)
      tip[i * 2] = 0
      tip[i * 2 + 1] = 1
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('tip', new Float32BufferAttribute(tip, 1))
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: new Color('#c9d6e3') }, uBright: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float tip;
        uniform float uTime;
        uniform float uIntensity;
        varying float vAlpha;
        void main() {
          float seed = fract(position.x * 13.17 + position.z * 7.31);
          if (seed > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
          vec3 cam = cameraPosition;
          float speed = 16.0 + seed * 6.0;
          vec3 p;
          p.x = mod(position.x - cam.x, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + cam.x;
          p.z = mod(position.z - cam.z, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + cam.z;
          p.y = mod(position.y - uTime * speed, ${HEIGHT.toFixed(1)}) - ${(HEIGHT / 2).toFixed(1)} + cam.y;
          p.y += tip * 0.6;
          p.x += tip * 0.09;
          vAlpha = (1.0 - tip * 0.7) * (1.0 - smoothstep(10.0, 18.0, distance(p.xz, cam.xz)));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uBright;
        varying float vAlpha;
        void main() { gl_FragColor = vec4(uColor * uBright, 0.42 * vAlpha); }`,
    })
    const lines = new LineSegments(g, m)
    lines.frustumCulled = false
    lines.renderOrder = 2
    return lines
  }, [drops])

  useEffect(() => () => {
    rain.geometry.dispose()
    ;(rain.material as ShaderMaterial).dispose()
  }, [rain])

  useFrame((_, dt) => {
    if (useGameStore.getState().phase === 'playing') updateWeather(Math.min(dt, 0.1))
    const u = (rain.material as ShaderMaterial).uniforms
    u.uTime.value += dt
    u.uIntensity.value = weather.rain
    u.uBright.value = 0.55 + weather.flash * 1.5
    rain.visible = weather.rain > 0.02
  })

  return <primitive object={rain} />
}
