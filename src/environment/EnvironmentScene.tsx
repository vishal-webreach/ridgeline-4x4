import type { WorldData } from './worldGen'
import type { QualityProfile } from '../game/quality'
import { Terrain } from './Terrain'
import { Trees, Bushes, Grass, Logs } from './Vegetation'
import { Rocks } from './Rocks'
import { FuelStation, SummitMarker } from './Landmarks'
import { Lighting } from './Lighting'
import { WeatherEffects } from './WeatherEffects'

/** Everything static in the world: sky, light, terrain, props. */
export function EnvironmentScene({ world, profile }: { world: WorldData; profile: QualityProfile }) {
  const shadows = profile.shadows
  return (
    <>
      <Lighting profile={profile} />
      <WeatherEffects drops={{ low: 1200, medium: 2400, high: 4000, ultra: 6000 }[profile.tier]} />
      <Terrain data={world.terrain} textures={world.textures} detail={profile.terrainDetail} cheap={profile.cheapMaterials} />
      <Trees trees={world.trees} shadows={shadows && profile.treeShadows} />
      <Rocks rocks={world.rocks} texture={world.textures.rock} shadows={shadows && profile.rockShadows} detail={profile.tier === 'high' ? 2 : 1} cheap={profile.cheapMaterials} />
      <Logs logs={world.logs} bark={world.textures.bark} shadows={shadows && profile.rockShadows} />
      <Bushes bushes={world.bushes} />
      <Grass chunks={world.grass} drawDistance={profile.grassDistance} />
      <FuelStation at={world.fuelStation} />
      {world.markers.map((m) => (
        <SummitMarker key={m.label} marker={m} />
      ))}
    </>
  )
}
