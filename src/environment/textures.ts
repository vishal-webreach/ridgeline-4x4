import { CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, type Texture } from 'three'
import { mulberry32, type Rand } from './noise'

/**
 * Procedurally painted, seamlessly tiling ground textures.
 * Generated once at load time on a canvas – no external image downloads.
 */
export interface TerrainTextures {
  grass: Texture
  dirt: Texture
  rock: Texture
  mud: Texture
  normal: Texture
  bark: Texture
}

/** Periodic value-noise lattice so textures tile without seams. */
class TileNoise {
  private grids: Float32Array[] = []
  constructor(private periods: number[], rand: Rand) {
    for (const p of periods) {
      const g = new Float32Array(p * p)
      for (let i = 0; i < g.length; i++) g[i] = rand()
      this.grids.push(g)
    }
  }

  /** u, v in [0, 1). Returns fbm in [0, 1]. */
  sample(u: number, v: number, gain = 0.5): number {
    let amp = 1
    let sum = 0
    let norm = 0
    for (let o = 0; o < this.periods.length; o++) {
      const p = this.periods[o]
      const g = this.grids[o]
      const x = u * p
      const y = v * p
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      const sx = fx * fx * (3 - 2 * fx)
      const sy = fy * fy * (3 - 2 * fy)
      const xa = ((x0 % p) + p) % p
      const ya = ((y0 % p) + p) % p
      const xb = (xa + 1) % p
      const yb = (ya + 1) % p
      const a = g[ya * p + xa]
      const b = g[ya * p + xb]
      const c = g[yb * p + xa]
      const d = g[yb * p + xb]
      sum += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy)
      norm += amp
      amp *= gain
    }
    return sum / norm
  }
}

type RGB = [number, number, number]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  return { canvas, ctx }
}

function fillNoise(ctx: CanvasRenderingContext2D, size: number, fn: (u: number, v: number) => RGB) {
  const img = ctx.createImageData(size, size)
  const d = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x / size, y / size)
      const i = (y * size + x) * 4
      d[i] = Math.max(0, Math.min(255, c[0]))
      d[i + 1] = Math.max(0, Math.min(255, c[1]))
      d[i + 2] = Math.max(0, Math.min(255, c[2]))
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Draws a shape at all wrap-around offsets so it tiles. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const px = x + ox
      const py = y + oy
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue
      draw(px, py)
    }
  }
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): Texture {
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

function grassTexture(size: number, rand: Rand) {
  const { canvas, ctx } = makeCanvas(size)
  const n = new TileNoise([4, 8, 16, 32, 64], rand)
  const fine = new TileNoise([64, 128], rand)
  fillNoise(ctx, size, (u, v) => {
    const a = n.sample(u, v)
    const f = fine.sample(u, v)
    const c = mix([58, 82, 30], [104, 122, 48], a)
    const k = 0.82 + f * 0.36
    return [c[0] * k, c[1] * k, c[2] * k]
  })
  const blades = Math.round(size * size * 0.016)
  ctx.lineCap = 'round'
  for (let i = 0; i < blades; i++) {
    const x = rand() * size
    const y = rand() * size
    const len = (3 + rand() * 7) * (size / 512)
    const ang = -Math.PI / 2 + (rand() - 0.5) * 1.1
    const g = 70 + rand() * 80
    ctx.strokeStyle = `rgba(${g * 0.62 + rand() * 30},${g + 20},${g * 0.35},${0.35 + rand() * 0.45})`
    ctx.lineWidth = (0.7 + rand() * 1.1) * (size / 512)
    wrapped(size, x, y, len, (px, py) => {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len)
      ctx.stroke()
    })
  }
  return canvas
}

function dirtTexture(size: number, rand: Rand) {
  const { canvas, ctx } = makeCanvas(size)
  const n = new TileNoise([4, 8, 16, 32, 64, 128], rand)
  const fine = new TileNoise([128, 256], rand)
  fillNoise(ctx, size, (u, v) => {
    const a = n.sample(u, v, 0.55)
    const f = fine.sample(u, v)
    const c = mix([96, 72, 50], [148, 118, 86], a)
    const k = 0.85 + f * 0.3
    return [c[0] * k, c[1] * k, c[2] * k]
  })
  const pebbles = Math.round(size * size * 0.004)
  for (let i = 0; i < pebbles; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = (0.8 + rand() * rand() * 4) * (size / 512)
    const shade = 90 + rand() * 90
    wrapped(size, x, y, r * 2, (px, py) => {
      ctx.fillStyle = 'rgba(35,25,15,0.35)'
      ctx.beginPath()
      ctx.ellipse(px + r * 0.35, py + r * 0.45, r, r * 0.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgb(${shade},${shade * 0.9},${shade * 0.78})`
      ctx.beginPath()
      ctx.ellipse(px, py, r, r * 0.8, rand() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  return canvas
}

function rockTexture(size: number, rand: Rand) {
  const { canvas, ctx } = makeCanvas(size)
  const n = new TileNoise([3, 6, 12, 24, 48, 96], rand)
  const crack = new TileNoise([6, 12, 24], rand)
  const lichen = new TileNoise([16, 32], rand)
  fillNoise(ctx, size, (u, v) => {
    const a = n.sample(u, v, 0.6)
    const cr = 1 - Math.abs(crack.sample(u, v) * 2 - 1)
    let c = mix([88, 84, 78], [150, 145, 136], a)
    if (cr > 0.9) c = mix(c, [45, 42, 38], (cr - 0.9) * 8)
    const l = lichen.sample(u, v)
    if (l > 0.68) c = mix(c, [128, 130, 80], Math.min(1, (l - 0.68) * 4))
    return c
  })
  return canvas
}

function barkTexture(size: number, rand: Rand) {
  const { canvas, ctx } = makeCanvas(size)
  const n = new TileNoise([4, 8, 16, 32], rand)
  const stretch = new TileNoise([32, 64], rand)
  fillNoise(ctx, size, (u, v) => {
    const a = n.sample(u, v)
    const s = stretch.sample(u * 0.25, v * 4 - Math.floor(v * 4))
    const c = mix([58, 40, 28], [112, 84, 60], a * 0.6 + s * 0.4)
    return c
  })
  return canvas
}

function mudTexture(size: number, rand: Rand) {
  const { canvas, ctx } = makeCanvas(size)
  const n = new TileNoise([4, 8, 16, 32, 64], rand)
  const ruts = new TileNoise([3, 6], rand)
  fillNoise(ctx, size, (u, v) => {
    const a = n.sample(u, v, 0.55)
    const r = ruts.sample(u, v)
    let c = mix([52, 38, 26], [84, 64, 44], a)
    // standing water in the low spots
    if (r < 0.32) c = mix(c, [58, 56, 52], Math.min(1, (0.32 - r) * 6))
    return c
  })
  return canvas
}

/** Generic ground normal map built from a tileable height field (Sobel filter). */
function normalTexture(size: number, rand: Rand) {
  const { canvas, ctx } = makeCanvas(size)
  const n = new TileNoise([8, 16, 32, 64, 128], rand)
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) height[y * size + x] = n.sample(x / size, y / size, 0.6)
  // pebble bumps
  const bumps = Math.round(size * size * 0.002)
  for (let i = 0; i < bumps; i++) {
    const cx = rand() * size
    const cy = rand() * size
    const r = 1.5 + rand() * 4
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r
        if (d > 1) continue
        const px = (Math.floor(cx + x) + size) % size
        const py = (Math.floor(cy + y) + size) % size
        height[py * size + px] += Math.sqrt(1 - d * d) * 0.08
      }
    }
  }
  const img = ctx.createImageData(size, size)
  const strength = 6
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

let cache: { size: number; tex: TerrainTextures } | null = null

export function createTerrainTextures(size: number): TerrainTextures {
  if (cache && cache.size === size) return cache.tex
  const rand = mulberry32(9001)
  const tex: TerrainTextures = {
    grass: toTexture(grassTexture(size, rand), true),
    dirt: toTexture(dirtTexture(size, rand), true),
    rock: toTexture(rockTexture(size, rand), true),
    mud: toTexture(mudTexture(size, rand), true),
    normal: toTexture(normalTexture(size, rand), false),
    bark: toTexture(barkTexture(Math.max(128, size / 2), rand), true),
  }
  cache = { size, tex }
  return tex
}
