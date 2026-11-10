import { makeTerrain, type TerrainParams } from '../sim/terrain'
import type { HeightFn } from '../sim/types'

/** A place to drive. Physics values here; colours are used by the renderer. */
export interface Environment {
  id: string
  name: string
  blurb: string
  /** Coins to unlock; 0 means open from the start. */
  price: number
  gravity: number
  groundFriction: number
  seed: number
  terrain: TerrainParams
  palette: { skyTop: string; skyBottom: string; ground: string; surface: string; far: string; near: string }
}

export const ENVIRONMENTS: Environment[] = [
  {
    id: 'meadow',
    name: 'Green Meadows',
    blurb: 'Rolling grassy hills',
    price: 0,
    gravity: 10,
    groundFriction: 0.9,
    seed: 11,
    terrain: { flatStart: 15, amplitude: 3.3, wavelength: 32, crests: 3.0, bumps: 0.2, growPerKm: 2.2, maxGrow: 3.2 },
    palette: { skyTop: '#5fa8e8', skyBottom: '#bfe3f7', ground: '#6b4a2f', surface: '#4c9a3d', far: '#8fbfa0', near: '#5f9e63' },
  },
  {
    id: 'crater',
    name: 'Crater Fields',
    blurb: 'Low gravity, huge floaty jumps',
    price: 4000,
    gravity: 4.2,
    groundFriction: 0.8,
    seed: 23,
    terrain: { flatStart: 15, amplitude: 3.6, wavelength: 46, crests: 4.5, bumps: 0.3, growPerKm: 1.4, maxGrow: 3 },
    palette: { skyTop: '#0c1026', skyBottom: '#2b2f5a', ground: '#55565f', surface: '#9a9ba6', far: '#3a3d5c', near: '#4c4e66' },
  },
  {
    id: 'frost',
    name: 'Frost Pass',
    blurb: 'Icy, steep and bumpy',
    price: 10000,
    gravity: 10,
    groundFriction: 0.38,
    seed: 37,
    terrain: { flatStart: 15, amplitude: 2.9, wavelength: 28, crests: 2, bumps: 0.35, growPerKm: 1.8, maxGrow: 3.2 },
    palette: { skyTop: '#9cc6e6', skyBottom: '#e8f3fb', ground: '#7e8fa3', surface: '#f4f8fc', far: '#b9cde0', near: '#9fb6cc' },
  },
]

export const environment = (id: string) => ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0]

const heights = new Map<string, HeightFn>()
/** The terrain height function for an environment (cached). */
export function heightFor(env: Environment): HeightFn {
  let h = heights.get(env.id)
  if (!h) heights.set(env.id, (h = makeTerrain(env.terrain, env.seed)))
  return h
}
