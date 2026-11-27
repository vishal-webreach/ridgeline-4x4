import { weather, type WeatherType } from './runtime'

export const WEATHER_LABELS: Record<WeatherType, string> = { clear: 'Clear', fog: 'Fog', rain: 'Rain', storm: 'Storm' }

const PRESETS: Record<WeatherType, { rain: number; fog: number; wetness: number; overcast: number }> = {
  clear: { rain: 0, fog: 0, wetness: 0, overcast: 0 },
  fog: { rain: 0, fog: 1, wetness: 0.3, overcast: 0.7 },
  rain: { rain: 0.6, fog: 0.45, wetness: 1, overcast: 0.85 },
  storm: { rain: 1, fog: 0.6, wetness: 1, overcast: 1 },
}

/** Switch weather; `instant` skips the transition (stage start). */
export function setWeather(type: WeatherType, instant = false) {
  weather.type = type
  if (instant) Object.assign(weather, PRESETS[type], { flash: 0 })
}

let nextStrike = 4

/** Eases the weather toward its preset and fires lightning in storms. */
export function updateWeather(dt: number) {
  const p = PRESETS[weather.type]
  const k = Math.min(1, dt * 0.25)
  weather.rain += (p.rain - weather.rain) * k
  weather.fog += (p.fog - weather.fog) * k
  weather.overcast += (p.overcast - weather.overcast) * k
  // surfaces get wet quickly in rain and dry slowly
  weather.wetness += (p.wetness - weather.wetness) * Math.min(1, dt * (p.wetness > weather.wetness ? 0.2 : 0.02))
  weather.flash = Math.max(0, weather.flash - dt * 6)
  if (weather.type === 'storm') {
    nextStrike -= dt
    if (nextStrike <= 0) {
      weather.flash = 1
      nextStrike = 5 + Math.random() * 12
    }
  }
}
