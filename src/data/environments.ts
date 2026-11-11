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

const MEADOW_GRAVITY = 9

export const ENVIRONMENTS: Environment[] = [
  {
    id: 'meadow',
    name: 'Green Meadows',
    blurb: 'Rolling grassy hills',
    price: 0,
    // Owner playtest: 10 felt too heavy. Same gravity in the air as on the ground.
    gravity: MEADOW_GRAVITY,
    groundFriction: 0.9,
    seed: 11,
    terrain: { flatStart: 15, amplitude: 3.0, wavelength: 38, crests: 2.8, bumps: 0.2, growPerKm: 1.0, maxGrow: 2.6, jumps: { spacing: 55, chance: 0.75, height: 1.3, ramp: 7, from: 45 } },
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
    terrain: { flatStart: 15, amplitude: 3.6, wavelength: 46, crests: 4.5, bumps: 0.3, growPerKm: 1.4, maxGrow: 3, jumps: { spacing: 70, chance: 0.6, height: 1.6, ramp: 9, from: 50 } },
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
    terrain: { flatStart: 15, amplitude: 2.9, wavelength: 28, crests: 2, bumps: 0.35, growPerKm: 1.8, maxGrow: 3.2, jumps: { spacing: 90, chance: 0.45, height: 1.1, ramp: 6, from: 80 } },
    palette: { skyTop: '#9cc6e6', skyBottom: '#e8f3fb', ground: '#7e8fa3', surface: '#f4f8fc', far: '#b9cde0', near: '#9fb6cc' },
  },
  {
    id: 'dunes',
    name: 'Dune Sea',
    blurb: 'Long sandy dunes, loose and fast',
    price: 7000,
    gravity: 9.5,
    // Loose sand: less grip than grass, so launches spin and climbs need feathering.
    groundFriction: 0.6,
    seed: 41,
    terrain: { flatStart: 15, amplitude: 4.2, wavelength: 62, crests: 1.6, bumps: 0.08, growPerKm: 1.2, maxGrow: 2.8, jumps: { spacing: 80, chance: 0.6, height: 1.5, ramp: 9, from: 55 } },
    palette: { skyTop: '#3d8fd6', skyBottom: '#f9dca6', ground: '#c4904f', surface: '#f1d29a', far: '#d99a6c', near: '#f0cd8f' },
  },
  {
    id: 'canyon',
    name: 'Red Canyon',
    blurb: 'Steep, rocky climbs with a good grip',
    price: 14000,
    gravity: 10,
    // Grippy rock: power and balance decide the climbs, not wheelspin.
    groundFriction: 1.0,
    seed: 53,
    // Steep and rocky; jumps kept rare and gentle, since kickers on steep ground threw every
    // vehicle onto its head (stage-time check).
    terrain: { flatStart: 15, amplitude: 3.6, wavelength: 36, crests: 2.8, bumps: 0.3, growPerKm: 1.6, maxGrow: 3.4, jumps: { spacing: 90, chance: 0.4, height: 1.0, ramp: 10, from: 60 } },
    palette: { skyTop: '#5a8fd0', skyBottom: '#f6d2a8', ground: '#8a4a2c', surface: '#d9875a', far: '#b5583a', near: '#d98757' },
  },
  {
    id: 'woods',
    name: 'Moonlit Woods',
    blurb: 'Night forest: muddy, rooty, fireflies',
    price: 20000,
    gravity: 9.5,
    // Mud: slippery, and roots make it bumpy.
    groundFriction: 0.5,
    seed: 67,
    terrain: { flatStart: 15, amplitude: 3.2, wavelength: 34, crests: 2.4, bumps: 0.45, growPerKm: 1.6, maxGrow: 3, jumps: { spacing: 65, chance: 0.6, height: 1.2, ramp: 7, from: 50 } },
    palette: { skyTop: '#0b1530', skyBottom: '#3e5a7a', ground: '#3a281b', surface: '#2f6a3a', far: '#1d2d4c', near: '#25443f' },
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
