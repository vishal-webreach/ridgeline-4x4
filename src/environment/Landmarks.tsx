import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, DoubleSide, MeshStandardMaterial, SRGBColorSpace, type Group } from 'three'
import type { Marker, Placement } from './worldGen'
import { useStaticColliders } from '../physics/useStaticColliders'
import { Surface } from './worldConfig'
import { VEHICLE } from '../vehicle/vehicleConfig'

const mats = {
  concrete: new MeshStandardMaterial({ color: '#9a9a94', roughness: 0.95 }),
  metal: new MeshStandardMaterial({ color: '#d9dbde', roughness: 0.35, metalness: 0.7 }),
  red: new MeshStandardMaterial({ color: '#b8321f', roughness: 0.5, metalness: 0.2 }),
  dark: new MeshStandardMaterial({ color: '#222326', roughness: 0.6, metalness: 0.4 }),
  wood: new MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 }),
  stripe: new MeshStandardMaterial({ color: '#f0c419', roughness: 0.6 }),
}

/** Text drawn onto a canvas texture (works offline – no font downloads). */
function useSignTexture(lines: string[], bg: string, fg: string) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 256
    const ctx = c.getContext('2d')!
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 512, 256)
    ctx.strokeStyle = fg
    ctx.lineWidth = 10
    ctx.strokeRect(12, 12, 488, 232)
    ctx.fillStyle = fg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((l, i) => {
      // shrink the font until the line fits inside the border
      let size = i === 0 ? 84 : 40
      const font = (px: number) => `${i === 0 ? 'bold' : '600'} ${px}px "Segoe UI", Arial, sans-serif`
      ctx.font = font(size)
      while (ctx.measureText(l).width > 440 && size > 20) ctx.font = font(--size)
      ctx.fillText(l, 256, lines.length === 1 ? 128 : 92 + i * 86)
    })
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [lines.join('|'), bg, fg]) // eslint-disable-line react-hooks/exhaustive-deps
}

function Sign({ lines, position, rotationY, bg = '#1f3b2b', fg = '#f3efe4' }: {
  lines: string[]; position: [number, number, number]; rotationY: number; bg?: string; fg?: string
}) {
  const tex = useSignTexture(lines, bg, fg)
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-1.1, 1.1, 0]} material={mats.wood} castShadow>
        <boxGeometry args={[0.14, 2.2, 0.14]} />
      </mesh>
      <mesh position={[1.1, 1.1, 0]} material={mats.wood} castShadow>
        <boxGeometry args={[0.14, 2.2, 0.14]} />
      </mesh>
      <mesh position={[0, 2.0, 0.08]} castShadow>
        <boxGeometry args={[2.6, 1.3, 0.06]} />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.8} />
        <meshStandardMaterial attach="material-5" map={tex} roughness={0.8} />
        <meshStandardMaterial attach="material-0" color="#3a2a1c" />
        <meshStandardMaterial attach="material-1" color="#3a2a1c" />
        <meshStandardMaterial attach="material-2" color="#3a2a1c" />
        <meshStandardMaterial attach="material-3" color="#3a2a1c" />
      </mesh>
    </group>
  )
}

/** Fuel station on a flat pad next to the spawn. Stop under the canopy to refuel. */
export function FuelStation({ at }: { at: Placement }) {
  const r = VEHICLE.fuel.stationRadius
  useStaticColliders(
    (rapier) => {
      const c = Math.cos(at.yaw)
      const s = Math.sin(at.yaw)
      // local (lx, lz) → world, with local +Z = road direction
      const w = (lx: number, lz: number) => [at.x + lx * c + lz * s, at.z - lx * s + lz * c] as const
      const specs = []
      for (const [lx, lz] of [[-4.2, -3.2], [4.2, -3.2], [-4.2, 3.2], [4.2, 3.2]]) {
        const [x, z] = w(lx, lz)
        specs.push({ desc: rapier.ColliderDesc.cylinder(2.4, 0.18).setTranslation(x, at.y + 2.4, z), surface: Surface.Dirt })
      }
      const [px, pz] = w(5.6, 0)
      specs.push({
        desc: rapier.ColliderDesc.cuboid(0.5, 1, 0.4).setTranslation(px, at.y + 1, pz).setRotation({ x: 0, y: Math.sin(at.yaw / 2), z: 0, w: Math.cos(at.yaw / 2) }),
        surface: Surface.Dirt,
      })
      return specs
    },
    [at],
  )

  return (
    <group position={[at.x, at.y, at.z]} rotation={[0, at.yaw, 0]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.concrete} receiveShadow>
        <circleGeometry args={[r + 1.5, 40]} />
      </mesh>
      {[[-4.2, -3.2], [4.2, -3.2], [-4.2, 3.2], [4.2, 3.2]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 2.4, z]} material={mats.metal} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 4.8, 12]} />
        </mesh>
      ))}
      <mesh position={[0, 4.95, 0]} material={mats.red} castShadow receiveShadow>
        <boxGeometry args={[10.2, 0.4, 8]} />
      </mesh>
      <mesh position={[0, 4.72, 0]} material={mats.stripe}>
        <boxGeometry args={[10.3, 0.08, 8.1]} />
      </mesh>
      <group position={[5.6, 0, 0]}>
        <mesh position={[0, 1, 0]} material={mats.red} castShadow>
          <boxGeometry args={[1, 2, 0.8]} />
        </mesh>
        <mesh position={[-0.51, 1.35, 0]} material={mats.dark}>
          <boxGeometry args={[0.02, 0.5, 0.6]} />
        </mesh>
        <mesh position={[-0.55, 0.9, 0.25]} material={mats.dark}>
          <boxGeometry args={[0.1, 0.25, 0.12]} />
        </mesh>
      </group>
      <Sign lines={['FUEL', 'stop here to refill']} position={[0, 0, -r - 3]} rotationY={0} bg="#b8321f" />
    </group>
  )
}

/** Summit flag with a waving banner and a name board. */
export function SummitMarker({ marker }: { marker: Marker }) {
  const flag = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.1 + marker.x) * 0.25
  })
  return (
    <group position={[marker.x, marker.y, marker.z]}>
      <mesh position={[0, 3, 0]} material={mats.metal} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 6, 8]} />
      </mesh>
      <group ref={flag} position={[0, 5.4, 0]}>
        <mesh position={[0.75, 0, 0]} castShadow>
          <planeGeometry args={[1.5, 0.9]} />
          <meshStandardMaterial color={marker.color} side={DoubleSide} roughness={0.8} />
        </mesh>
      </group>
      <Sign lines={[marker.label.split(' ').slice(0, -1).join(' ').toUpperCase(), marker.label.split(' ').slice(-1)[0]]} position={[2.5, 0, 1]} rotationY={0.6} />
    </group>
  )
}
