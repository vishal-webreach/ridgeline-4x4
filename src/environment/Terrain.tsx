import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial, Vector2 } from 'three'
import type { TerrainData } from './terrainGenerator'
import type { TerrainTextures } from './textures'
import { useStaticColliders } from '../physics/useStaticColliders'
import { WORLD } from './worldConfig'

/** Terrain is rendered as square tiles so the camera only draws what it can see. */
const TILE_SEGS = 40

/**
 * Splat-mapped terrain material: grass / dirt / rock / mud blended per vertex.
 * `detail` trades quality for speed:
 *  0 – one texture lookup per layer (mobile)
 *  1 – two scales per layer + detail normal map
 *  2 – + tri-planar rock so cliffs don't stretch
 * Wet mud gets a glossier roughness.
 */
function createTerrainMaterial(tex: TerrainTextures, size: number, detail: 0 | 1 | 2, cheap: boolean) {
  tex.normal.repeat.set(size / 7, size / 7)
  const params = {
    vertexColors: true,
    normalMap: detail > 0 ? tex.normal : null,
    normalScale: new Vector2(0.9, 0.9),
  }
  // Lambert skips specular/IBL – terrain is fully rough, so it looks the same for far less GPU time
  const mat = cheap ? new MeshLambertMaterial(params) : new MeshStandardMaterial({ ...params, roughness: 0.95, metalness: 0 })
  const two = (t: string, s1: number, s2: number) =>
    detail === 0 ? `texture2D(${t}, tuv * ${s1.toFixed(3)}).rgb` : `mix(texture2D(${t}, tuv * ${s1.toFixed(3)}).rgb, texture2D(${t}, tuv * ${s2.toFixed(3)}).rgb, 0.35)`
  const rock =
    detail === 2
      ? 'mix(sampleRock(vTerrainPos, normalize(vTerrainNormal), 0.16), sampleRock(vTerrainPos, normalize(vTerrainNormal), 0.041), 0.4)'
      : two('tRock', 0.16, 0.043)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: tex.grass }
    shader.uniforms.tDirt = { value: tex.dirt }
    shader.uniforms.tRock = { value: tex.rock }
    shader.uniforms.tMud = { value: tex.mud }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vTerrainPos;\nvarying vec3 vTerrainNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSplat = splat;\nvTerrainPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvTerrainNormal = normal;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrass;
uniform sampler2D tDirt;
uniform sampler2D tRock;
uniform sampler2D tMud;
varying vec4 vSplat;
varying vec3 vTerrainPos;
varying vec3 vTerrainNormal;
vec3 sampleRock(vec3 p, vec3 n, float s) {
  vec3 b = pow(abs(n), vec3(4.0));
  b /= (b.x + b.y + b.z);
  return texture2D(tRock, p.zy * s).rgb * b.x + texture2D(tRock, p.xz * s).rgb * b.y + texture2D(tRock, p.xy * s).rgb * b.z;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 tuv = vTerrainPos.xz;
vec4 w = vSplat / max(vSplat.x + vSplat.y + vSplat.z + vSplat.w, 1e-4);
vec3 terrainCol = ${two('tGrass', 0.22, 0.047)} * w.x + ${two('tDirt', 0.26, 0.061)} * w.y;
if (w.z > 0.01) terrainCol += ${rock} * w.z;
if (w.w > 0.01) terrainCol += texture2D(tMud, tuv * 0.2).rgb * w.w;
diffuseColor.rgb *= terrainCol;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, w.w);',
      )
  }
  mat.customProgramCacheKey = () => `terrain-${detail}-${cheap}`
  return mat
}

/** Splits the full grid into tiles, copying positions, normals and per-vertex data. */
function buildTiles(data: TerrainData) {
  const full = new BufferGeometry()
  full.setAttribute('position', new BufferAttribute(data.positions, 3))
  full.setIndex(new BufferAttribute(data.indices, 1))
  full.computeVertexNormals()
  const normals = full.getAttribute('normal').array as Float32Array
  full.dispose()

  const row = data.row
  const tiles: BufferGeometry[] = []
  const n = TILE_SEGS + 1
  for (let tz = 0; tz < data.segments; tz += TILE_SEGS) {
    for (let tx = 0; tx < data.segments; tx += TILE_SEGS) {
      const pos = new Float32Array(n * n * 3)
      const nor = new Float32Array(n * n * 3)
      const uv = new Float32Array(n * n * 2)
      const spl = new Float32Array(n * n * 4)
      const col = new Float32Array(n * n * 3)
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const src = (tz + j) * row + (tx + i)
          const dst = j * n + i
          pos.set(data.positions.subarray(src * 3, src * 3 + 3), dst * 3)
          nor.set(normals.subarray(src * 3, src * 3 + 3), dst * 3)
          uv.set(data.uvs.subarray(src * 2, src * 2 + 2), dst * 2)
          spl.set(data.splat.subarray(src * 4, src * 4 + 4), dst * 4)
          col.set(data.colors.subarray(src * 3, src * 3 + 3), dst * 3)
        }
      }
      const idx = new Uint16Array(TILE_SEGS * TILE_SEGS * 6)
      let k = 0
      for (let j = 0; j < TILE_SEGS; j++) {
        for (let i = 0; i < TILE_SEGS; i++) {
          const a = j * n + i
          const b = a + 1
          const c = a + n
          const d = c + 1
          idx[k++] = a
          idx[k++] = c
          idx[k++] = b
          idx[k++] = c
          idx[k++] = d
          idx[k++] = b
        }
      }
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pos, 3))
      g.setAttribute('normal', new BufferAttribute(nor, 3))
      g.setAttribute('uv', new BufferAttribute(uv, 2))
      g.setAttribute('splat', new BufferAttribute(spl, 4))
      g.setAttribute('color', new BufferAttribute(col, 3))
      g.setIndex(new BufferAttribute(idx, 1))
      g.computeBoundingSphere()
      tiles.push(g)
    }
  }
  return tiles
}

export function Terrain({ data, textures, detail, cheap }: { data: TerrainData; textures: TerrainTextures; detail: 0 | 1 | 2; cheap: boolean }) {
  const material = useMemo(() => createTerrainMaterial(textures, data.size, detail, cheap), [textures, data.size, detail, cheap])
  const meshes = useMemo(() => {
    return buildTiles(data).map((g) => {
      const m = new Mesh(g, material)
      m.receiveShadow = true
      m.matrixAutoUpdate = false
      return m
    })
  }, [data, material])

  useEffect(
    () => () => {
      meshes.forEach((m) => m.geometry.dispose())
      material.dispose()
    },
    [meshes, material],
  )

  // exact same vertices/triangles as the render tiles → wheels touch what you see
  useStaticColliders(
    (rapier) => {
      const desc = rapier.ColliderDesc.trimesh(data.positions, data.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0.9)
        .setRestitution(0)
      const specs = [{ desc, surface: 'terrain' as const }]
      // invisible boundary walls
      const b = WORLD.boundary
      const wall = (x: number, z: number, hx: number, hz: number) =>
        specs.push({ desc: rapier.ColliderDesc.cuboid(hx, 150, hz).setTranslation(x, 60, z), surface: 'terrain' as const })
      wall(b + 1, 0, 1, b + 2)
      wall(-b - 1, 0, 1, b + 2)
      wall(0, b + 1, b + 2, 1)
      wall(0, -b - 1, b + 2, 1)
      return specs
    },
    [data],
  )

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}
