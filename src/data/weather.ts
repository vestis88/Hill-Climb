import type { Environment } from './environments'

/**
 * Time of day and weather. Only the daily challenge has them (owner: weather only on the daily,
 * and there it changes the grip). The date picks them, so everyone gets the same day.
 */
export interface Atmosphere {
  time: 'day' | 'dusk' | 'night'
  weather: 'clear' | 'rain' | 'snow' | 'fog'
}

/** How much grip the ground keeps in this weather: rain makes it slippery, snow more so. */
export const WEATHER_GRIP: Record<Atmosphere['weather'], number> = { clear: 1, fog: 1, rain: 0.82, snow: 0.72 }

export const WEATHER_NAME: Record<Atmosphere['weather'], string> = { clear: '', fog: 'Dimma', rain: 'Regn, halt', snow: 'Snö, mycket halt' }

/** Pick a mood for a map from random numbers in 0..1. Maps that are already night stay dark. */
export function pickAtmosphere(env: Environment, r: () => number): Atmosphere {
  const darkAlready = env.id === 'woods' || env.id === 'crater'
  const t = r()
  const time: Atmosphere['time'] = darkAlready ? 'day' : t < 0.6 ? 'day' : t < 0.85 ? 'dusk' : 'night'
  // Weather that fits the map: no rain or fog on the moon, no rain in the desert or on Frost Pass
  // (it snows there anyway), snow only on the meadow and in the woods.
  const options: Atmosphere['weather'][] = []
  if (env.id !== 'crater' && env.id !== 'dunes' && env.id !== 'frost') options.push('rain')
  if (env.id === 'meadow' || env.id === 'woods') options.push('snow')
  if (env.id !== 'crater') options.push('fog')
  const weather = options.length && r() < 0.4 ? options[Math.floor(r() * options.length)] : 'clear'
  return { time, weather }
}
