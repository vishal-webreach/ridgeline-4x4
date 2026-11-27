/**
 * Graphics quality tiers. 'auto' picks a tier from the device (touch / GPU /
 * CPU cores); the adaptive resolution system then fine-tunes the pixel ratio
 * at runtime to hold a smooth frame rate.
 */
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra'
export type QualitySetting = 'auto' | QualityTier

export interface QualityProfile {
  tier: QualityTier
  /** adaptive pixel-ratio range */
  dprMin: number
  dprMax: number
  antialias: boolean
  /** real-time sun shadows (low uses a blob shadow under the truck instead) */
  shadows: boolean
  shadowMapSize: number
  /** 'basic' = single tap (cheap), 'pcf' = filtered soft edges */
  shadowType: 'basic' | 'pcf'
  /** Lambert instead of PBR for terrain & rocks (much cheaper per pixel) */
  cheapMaterials: boolean
  /** half-size of the shadow frustum around the truck (m) */
  shadowExtent: number
  rockShadows: boolean
  treeShadows: boolean
  trees: number
  grass: number
  grassDistance: number
  bushes: number
  textureSize: number
  /** 0 = single texture sample per layer, 1 = two scales, 2 = + tri-planar rock & detail normals */
  terrainDetail: 0 | 1 | 2
  cameraFar: number
  fogNear: number
  fogFar: number
  /** PBR reflections from a baked sky cube map */
  envMap: boolean
  headlights: 1 | 2
}

export const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low', dprMin: 0.65, dprMax: 1, antialias: false,
    shadows: false, shadowMapSize: 512, shadowType: 'basic', cheapMaterials: true, shadowExtent: 25, rockShadows: false, treeShadows: false,
    trees: 1100, grass: 7000, grassDistance: 45, bushes: 250, textureSize: 256, terrainDetail: 0,
    cameraFar: 480, fogNear: 70, fogFar: 430, envMap: false, headlights: 1,
  },
  medium: {
    tier: 'medium', dprMin: 0.6, dprMax: 1.25, antialias: false,
    shadows: true, shadowMapSize: 1024, shadowType: 'basic', cheapMaterials: true, shadowExtent: 32, rockShadows: true, treeShadows: false,
    trees: 1900, grass: 22000, grassDistance: 70, bushes: 550, textureSize: 512, terrainDetail: 1,
    cameraFar: 750, fogNear: 110, fogFar: 560, envMap: true, headlights: 2,
  },
  high: {
    tier: 'high', dprMin: 0.75, dprMax: 1.75, antialias: true,
    shadows: true, shadowMapSize: 2048, shadowType: 'pcf', cheapMaterials: false, shadowExtent: 50, rockShadows: true, treeShadows: true,
    trees: 2600, grass: 50000, grassDistance: 105, bushes: 900, textureSize: 512, terrainDetail: 2,
    cameraFar: 1400, fogNear: 140, fogFar: 640, envMap: true, headlights: 2,
  },
  /** "Extreme": everything maxed – for strong desktop GPUs (never picked by Auto). */
  ultra: {
    tier: 'ultra', dprMin: 1, dprMax: 2, antialias: true,
    shadows: true, shadowMapSize: 4096, shadowType: 'pcf', cheapMaterials: false, shadowExtent: 70, rockShadows: true, treeShadows: true,
    trees: 3600, grass: 90000, grassDistance: 150, bushes: 1400, textureSize: 1024, terrainDetail: 2,
    cameraFar: 1800, fogNear: 180, fogFar: 900, envMap: true, headlights: 2,
  },
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0)

let detected: QualityTier | null = null

/** Best-guess tier for this device. */
export function detectTier(): QualityTier {
  if (detected) return detected
  let tier: QualityTier = 'high'
  try {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (isTouchDevice() && Math.min(screen.width, screen.height) < 900)
    const cores = navigator.hardwareConcurrency || 4
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    let renderer = ''
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    const integrated = /intel|uhd|hd graphics|iris|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|microsoft basic/.test(renderer)
    if (mobile || cores <= 2 || /swiftshader|llvmpipe|basic/.test(renderer)) tier = 'low'
    else if (integrated || cores <= 4) tier = 'medium'
  } catch {
    tier = 'medium'
  }
  detected = tier
  return tier
}

export function resolveTier(setting: QualitySetting): QualityTier {
  return setting === 'auto' ? detectTier() : setting
}

export const QUALITY_LABELS: Record<QualitySetting, string> = {
  auto: 'Auto',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Extreme',
}
