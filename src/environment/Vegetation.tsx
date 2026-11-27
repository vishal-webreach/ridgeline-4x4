import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color, CylinderGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, Object3D,
  Quaternion, Vector3, type Texture,
} from 'three'
import type { GrassChunk, LogInstance, PropInstance, TreeInstance } from './worldGen'
import { createBushGeometry, createGrassTuftGeometry, createTreeGeometry } from './propGeometry'
import { useStaticColliders } from '../physics/useStaticColliders'
import { Surface } from './worldConfig'

const TREE_CHUNK = 160
const dummy = new Object3D()
const tmpColor = new Color()

function buildInstanced(
  geometry: InstancedMesh['geometry'],
  material: MeshLambertMaterial,
  items: { x: number; y: number; z: number; scale: number; rot: number }[],
  opts: { cast: boolean; receive: boolean; tint?: (i: number) => number },
) {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, items.length))
  mesh.count = items.length
  items.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z)
    dummy.rotation.set(0, t.rot, 0)
    dummy.scale.setScalar(t.scale)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    if (opts.tint) mesh.setColorAt(i, tmpColor.setScalar(opts.tint(i)))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = opts.cast
  mesh.receiveShadow = opts.receive
  mesh.matrixAutoUpdate = false
  mesh.computeBoundingSphere()
  return mesh
}

/**
 * Instanced pine + broadleaf forest. Trunk and crown are one merged,
 * vertex-coloured geometry, grouped in 160 m chunks so the camera and the
 * shadow camera cull whole chunks. Trunks get physics colliders.
 */
export function Trees({ trees, shadows }: { trees: TreeInstance[]; shadows: boolean }) {
  const meshes = useMemo(() => {
    const geos = [createTreeGeometry(0), createTreeGeometry(1)]
    const mat = new MeshLambertMaterial({ vertexColors: true })
    const chunks = new Map<string, TreeInstance[]>()
    for (const t of trees) {
      const key = `${Math.floor(t.x / TREE_CHUNK)},${Math.floor(t.z / TREE_CHUNK)}`
      const list = chunks.get(key)
      if (list) list.push(t)
      else chunks.set(key, [t])
    }
    const out: InstancedMesh[] = []
    for (const list of chunks.values()) {
      for (const species of [0, 1] as const) {
        const items = list.filter((t) => t.species === species)
        if (items.length) out.push(buildInstanced(geos[species], mat, items, { cast: shadows, receive: true, tint: (i) => items[i].tint }))
      }
    }
    return out
  }, [trees, shadows])

  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes])

  useStaticColliders(
    (rapier) =>
      trees.map((t) => {
        const radius = (t.species === 0 ? 0.22 : 0.28) * t.scale
        return {
          desc: rapier.ColliderDesc.cylinder(1.6 * t.scale, radius).setTranslation(t.x, t.y + 1.6 * t.scale, t.z).setFriction(0.6),
          surface: Surface.Wood,
        }
      }),
    [trees],
  )

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}

export function Bushes({ bushes }: { bushes: PropInstance[] }) {
  const mesh = useMemo(() => {
    const mat = new MeshLambertMaterial({ vertexColors: true })
    return buildInstanced(createBushGeometry(), mat, bushes, { cast: false, receive: true, tint: (i) => 0.8 + (i % 7) * 0.05 })
  }, [bushes])
  useEffect(() => () => mesh.dispose(), [mesh])
  return <primitive object={mesh} />
}

/** Fallen logs across trails and in the forest – climbable step obstacles. */
export function Logs({ logs, bark, shadows }: { logs: LogInstance[]; bark: Texture; shadows: boolean }) {
  const mesh = useMemo(() => {
    const geo = new CylinderGeometry(1, 1, 1, 9, 1)
    const mat = new MeshLambertMaterial({ map: bark, color: '#b9a690' })
    const m = new InstancedMesh(geo, mat, Math.max(1, logs.length))
    m.count = logs.length
    const q = new Quaternion()
    const along = new Vector3()
    logs.forEach((l, i) => {
      along.set(Math.sin(l.yaw), 0, Math.cos(l.yaw))
      q.setFromUnitVectors(new Vector3(0, 1, 0), along)
      dummy.position.set(l.x, l.y, l.z)
      dummy.quaternion.copy(q)
      dummy.scale.set(l.radius, l.length, l.radius)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.castShadow = shadows
    m.receiveShadow = true
    m.computeBoundingSphere()
    return m
  }, [logs, bark, shadows])
  useEffect(() => () => mesh.dispose(), [mesh])

  useStaticColliders(
    (rapier) => {
      const q = new Quaternion()
      const along = new Vector3()
      return logs.map((l) => {
        along.set(Math.sin(l.yaw), 0, Math.cos(l.yaw))
        q.setFromUnitVectors(new Vector3(0, 1, 0), along)
        return {
          desc: rapier.ColliderDesc.cylinder(l.length / 2, l.radius).setTranslation(l.x, l.y, l.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.7),
          surface: Surface.Wood,
        }
      })
    },
    [logs],
  )
  return <primitive object={mesh} />
}

/**
 * Grass tufts in spatial chunks: whole chunks beyond the draw distance are
 * hidden, and tufts shrink smoothly to nothing as they approach it (no
 * popping). Wind sway is computed in the vertex shader.
 */
export function Grass({ chunks, drawDistance }: { chunks: GrassChunk[]; drawDistance: number }) {
  const uniforms = useRef({ uTime: { value: 0 }, uFade: { value: new Vector3(drawDistance * 0.6, drawDistance, 0) } })
  const { meshes, material } = useMemo(() => {
    const geometry = createGrassTuftGeometry()
    const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime
      shader.uniforms.uFade = uniforms.current.uFade
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uFade;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, distance(ip.xz, cameraPosition.xz));
  transformed *= fade;
  float sway = sin(uTime * 1.6 + ip.x * 0.21 + ip.z * 0.17) + 0.5 * sin(uTime * 2.7 + ip.x * 0.5);
  transformed.x += sway * 0.07 * position.y * fade;
  transformed.z += sway * 0.04 * position.y * fade;
#endif`,
        )
    }
    const meshes = chunks.map((c) => {
      const m = new InstancedMesh(geometry, material, c.count)
      m.instanceMatrix = new InstancedBufferAttribute(c.matrices, 16)
      m.receiveShadow = true
      m.castShadow = false
      m.matrixAutoUpdate = false
      m.computeBoundingSphere()
      m.userData.center = [c.cx, c.cz]
      return m
    })
    return { meshes, material }
  }, [chunks])

  useEffect(
    () => () => {
      meshes.forEach((m) => m.dispose())
      material.dispose()
    },
    [meshes, material],
  )

  const frame = useRef(0)
  useFrame((state, dt) => {
    uniforms.current.uTime.value += dt
    uniforms.current.uFade.value.set(drawDistance * 0.6, drawDistance, 0)
    if (frame.current++ % 8 !== 0) return
    const cam = state.camera.position
    const lim = (drawDistance + 46) ** 2
    for (const m of meshes) {
      const [cx, cz] = m.userData.center as [number, number]
      m.visible = (cam.x - cx) ** 2 + (cam.z - cz) ** 2 < lim
    }
  })

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  )
}
