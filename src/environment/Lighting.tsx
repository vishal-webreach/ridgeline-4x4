import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'
import {
  AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Fog, Object3D, Points, PointsMaterial, Vector3,
  type DirectionalLight, type HemisphereLight, type ShaderMaterial,
} from 'three'
import { vehicleRefs } from '../vehicle/vehicleRefs'
import { lighting, weather } from '../game/runtime'
import { useGameStore } from '../game/store'
import type { QualityProfile } from '../game/quality'
import { mulberry32 } from './noise'

const SKY = { turbidity: 5.5, rayleigh: 1.1, mieCoefficient: 0.004, mieDirectionalG: 0.82 }
const NOON_SUN = new Vector3(-0.42, 0.62, 0.66).normalize().multiplyScalar(1000)

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Sun direction for a time of day (sunrise ≈ 06:00 in the east, sunset ≈ 18:00). Returns sin(elevation). */
export function sunDirection(hours: number, out: Vector3) {
  const dayAngle = ((hours - 6) / 12) * Math.PI
  const elevation = Math.asin(Math.max(-1, Math.min(1, Math.sin(dayAngle)))) * 0.78
  const azimuth = dayAngle + 0.6
  out.set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth) * 0.8 + 0.25)
  out.normalize()
  return out.y
}

export function timeOfDayLabel(h: number) {
  if (h >= 4.5 && h < 6.5) return 'DAWN'
  if (h >= 6.5 && h < 11) return 'MORNING'
  if (h >= 11 && h < 14) return 'MIDDAY'
  if (h >= 14 && h < 17.3) return 'AFTERNOON'
  if (h >= 17.3 && h < 19.6) return 'DUSK'
  return 'NIGHT'
}

const C = {
  fogDay: new Color('#c6d4dd'),
  fogGold: new Color('#d9a982'),
  fogNight: new Color('#0c1424'),
  sunDay: new Color('#fff0da'),
  sunLow: new Color('#ffad66'),
  moon: new Color('#9fb6ff'),
  skyDay: new Color('#c4dcf2'),
  skyNight: new Color('#1b2944'),
  groundDay: new Color('#5d5538'),
  groundNight: new Color('#0b0c10'),
}

/**
 * Day/night lighting: Preetham sky, a sun that moves with the clock (moon at
 * night), sky/ground fill, distance fog that matches the sky, stars, night
 * exposure and automatic headlights. The shadow frustum follows the truck and
 * is snapped to texels so shadows don't swim.
 */
export function Lighting({ profile }: { profile: QualityProfile }) {
  const light = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const skyMat = useRef<ShaderMaterial | null>(null)
  const skyMesh = useRef<Object3D | null>(null)
  const grey = useMemo(() => new Color(), [])
  const target = useMemo(() => new Object3D(), [])
  const center = useMemo(() => new Vector3(), [])
  const sunDir = useMemo(() => new Vector3(), [])
  const lightDir = useMemo(() => new Vector3(), [])
  const fogColor = useMemo(() => new Color(), [])
  // narrow selectors: re-rendering on every resize would re-bake the environment map
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const envSky = useMemo(() => <Sky sunPosition={NOON_SUN} {...SKY} />, [])

  const stars = useMemo(() => {
    const rand = mulberry32(7)
    const n = profile.tier === 'low' ? 600 : 1400
    const pos = new Float32Array(n * 3)
    const r = profile.cameraFar * 0.8
    for (let i = 0; i < n; i++) {
      const u = rand() * Math.PI * 2
      const v = Math.acos(1 - rand() * 0.95)
      pos.set([Math.sin(v) * Math.cos(u) * r, Math.cos(v) * r, Math.sin(v) * Math.sin(u) * r], i * 3)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    const m = new PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: AdditiveBlending })
    const p = new Points(g, m)
    p.frustumCulled = false
    p.renderOrder = -1
    return p
  }, [profile.tier, profile.cameraFar])

  useEffect(() => {
    scene.fog = new Fog(C.fogDay, profile.fogNear, profile.fogFar)
    return () => {
      scene.fog = null
    }
  }, [scene, profile.fogNear, profile.fogFar])

  useEffect(() => () => {
    stars.geometry.dispose()
    ;(stars.material as PointsMaterial).dispose()
  }, [stars])

  useFrame(({ camera }, dt) => {
    if (useGameStore.getState().phase === 'playing') lighting.hours = (lighting.hours + Math.min(dt, 0.1) * lighting.timeScale) % 24
    const sinEl = sunDirection(lighting.hours, sunDir)
    const daylight = smooth(-0.1, 0.22, sinEl)
    lighting.daylight = daylight
    lighting.headlightsOn = lighting.manualHeadlights ?? daylight < 0.4

    skyMat.current?.uniforms.sunPosition.value.copy(sunDir).multiplyScalar(1000)

    const l = light.current
    if (l) {
      if (sinEl > 0) {
        lightDir.copy(sunDir)
        l.color.copy(C.sunLow).lerp(C.sunDay, smooth(0.02, 0.4, sinEl))
        l.intensity = 3.1 * smooth(0, 0.22, sinEl) * (1 - 0.72 * weather.overcast)
      } else {
        lightDir.set(0.35, 0.85, -0.4).normalize()
        l.color.copy(C.moon)
        l.intensity = 0.45 * smooth(0, -0.12, sinEl) * (1 - 0.8 * weather.overcast)
      }
      const obj = vehicleRefs.object
      if (obj) obj.getWorldPosition(center)
      else center.copy(camera.position)
      if (profile.shadows) {
        const texel = (profile.shadowExtent * 2) / profile.shadowMapSize
        center.x = Math.round(center.x / texel) * texel
        center.z = Math.round(center.z / texel) * texel
      }
      target.position.copy(center)
      target.updateMatrixWorld()
      l.position.copy(center).addScaledVector(lightDir, 160)
    }

    const h = hemi.current
    if (h) {
      h.intensity = (0.14 + 0.48 * daylight) * (1 - 0.25 * weather.overcast) + weather.flash * 2.5
      h.color.copy(C.skyNight).lerp(C.skyDay, daylight)
      h.groundColor.copy(C.groundNight).lerp(C.groundDay, daylight)
    }

    fogColor.copy(C.fogNight).lerp(C.fogGold, smooth(-0.12, 0.04, sinEl)).lerp(C.fogDay, smooth(0.06, 0.32, sinEl))
    // overcast / fog / rain: grey the fog, pull it in, and hide the sky behind it
    grey.setRGB(0.5, 0.54, 0.57).multiplyScalar(0.18 + 0.82 * daylight)
    fogColor.lerp(grey, weather.overcast * 0.85)
    if (weather.flash > 0) fogColor.lerp(C.skyDay, weather.flash * 0.5)
    const fog = scene.fog as Fog | null
    if (fog) {
      fog.color.copy(fogColor)
      fog.near = profile.fogNear + (12 - profile.fogNear) * weather.fog
      fog.far = profile.fogFar + (150 - profile.fogFar) * weather.fog
    }
    if (skyMesh.current) skyMesh.current.visible = weather.overcast < 0.55
    if (!scene.background || !(scene.background instanceof Color)) scene.background = new Color()
    ;(scene.background as Color).copy(fogColor)
    if (profile.envMap) scene.environmentIntensity = (0.04 + 0.55 * daylight) * (1 - 0.5 * weather.overcast)
    gl.toneMappingExposure = 1 + 0.45 * (1 - daylight) + weather.flash * 1.2

    const starMat = stars.material as PointsMaterial
    starMat.opacity = (1 - smooth(-0.14, 0.04, sinEl)) * (1 - weather.overcast)
    stars.visible = starMat.opacity > 0.01
    stars.position.copy(camera.position)
  })

  return (
    <>
      <Sky ref={(s) => { skyMat.current = s?.material ?? null; skyMesh.current = s }} sunPosition={NOON_SUN} {...SKY} />
      {profile.envMap && (
        <Environment resolution={64} frames={1} environmentIntensity={0.55}>
          {envSky}
        </Environment>
      )}
      <primitive object={stars} />
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color="#fff0da"
        intensity={3.1}
        castShadow={profile.shadows}
        shadow-mapSize={[profile.shadowMapSize, profile.shadowMapSize]}
        shadow-camera-left={-profile.shadowExtent}
        shadow-camera-right={profile.shadowExtent}
        shadow-camera-top={profile.shadowExtent}
        shadow-camera-bottom={-profile.shadowExtent}
        shadow-camera-near={10}
        shadow-camera-far={340}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      <hemisphereLight ref={hemi} args={['#c4dcf2', '#5d5538', 0.6]} />
    </>
  )
}
