import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three'
import type { MatKey } from './truckGeometry'

/** Reusable PBR materials for the trucks (created once, shared by every mesh). */
export const truckMaterials = {
  plastic: new MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.72, metalness: 0.05 }),
  steel: new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.42, metalness: 0.85 }),
  chrome: new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.18, metalness: 1 }),
  frame: new MeshStandardMaterial({ color: '#141516', roughness: 0.6, metalness: 0.5 }),
  glass: new MeshPhysicalMaterial({ color: '#0d161c', roughness: 0.04, metalness: 0.2, clearcoat: 1, side: DoubleSide }),
  headlight: new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0.6, roughness: 0.2 }),
  amber: new MeshStandardMaterial({ color: '#ffb340', emissive: '#ff9a1f', emissiveIntensity: 0.5, roughness: 0.3 }),
  taillight: new MeshStandardMaterial({ color: '#7a0a0a', emissive: '#ff1a10', emissiveIntensity: 0.6, roughness: 0.3 }),
  lightbar: new MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f1ff', emissiveIntensity: 0.5, roughness: 0.2 }),
  tire: new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.93, metalness: 0 }),
  rim: new MeshStandardMaterial({ color: '#2b2d30', roughness: 0.35, metalness: 0.85 }),
  rimAccent: new MeshStandardMaterial({ color: '#b08a4a', roughness: 0.3, metalness: 0.95 }),
  shock: new MeshStandardMaterial({ color: '#e0a91c', roughness: 0.35, metalness: 0.6 }),
  shockShaft: new MeshStandardMaterial({ color: '#d6d8dc', roughness: 0.15, metalness: 1 }),
  spring: new MeshStandardMaterial({ color: '#b3261e', roughness: 0.4, metalness: 0.5 }),
  bedLiner: new MeshStandardMaterial({ color: '#202123', roughness: 0.95, metalness: 0 }),
  case: new MeshStandardMaterial({ color: '#2d3033', roughness: 0.7, metalness: 0.2 }),
  boards: new MeshStandardMaterial({ color: '#f07a1a', roughness: 0.6, metalness: 0 }),
  red: new MeshStandardMaterial({ color: '#b8261c', roughness: 0.5, metalness: 0.3 }),
}

const paintCache = new Map<string, MeshPhysicalMaterial>()

export function paintMaterial(color: string) {
  let m = paintCache.get(color)
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: new Color(color), metalness: 0.15, roughness: 0.48, clearcoat: 0.5, clearcoatRoughness: 0.28, envMapIntensity: 0.55,
    })
    paintCache.set(color, m)
  }
  return m
}

export function materialFor(key: MatKey, paint: string, trim: string): Material {
  if (key === 'paint') return paintMaterial(paint)
  if (key === 'trim') return paintMaterial(trim)
  return truckMaterials[key]
}
