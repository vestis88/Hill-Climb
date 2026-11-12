import { heightFor, type Environment } from '../data/environments'
import { setPiecesBetween } from '../sim/terrain'

/**
 * Hidden stars: three per map, high above the first three jumps and table-tops (set pieces) along
 * the track, so they take a good jump (or the Moon Lander's thrusters) to reach. Each pays 250
 * coins once; finding all three on a map pays 1,000 more and, the first time, unlocks the gold
 * star helmet pattern. Found stars are kept in save.unlocked as "star:<map>:<n>", so they sync.
 */
export interface Star {
  id: string
  x: number
  y: number
}

export const STAR_COINS = 250
export const ALL_STARS_COINS = 1000

const cache = new Map<string, Star[]>()

/** A map's three stars (none on a daily-challenge variant). */
export function starsFor(env: Environment): Star[] {
  if (env.variant) return []
  const hit = cache.get(env.id)
  if (hit) return hit
  const h = heightFor(env)
  const flat = env.terrain.flatStart
  const pieces = setPiecesBetween(env.seed, 0, 6000).filter((p) => p.kind !== 'whoops').slice(0, 3)
  const stars = pieces.map((p, i) => {
    const x = flat + p.start + p.length * (p.kind === 'double' ? 0.75 : 0.5)
    // Higher with lower gravity: a jump goes much further on the moon.
    const lift = 3.2 * Math.min(2, Math.max(1, 9 / env.gravity))
    return { id: `star:${env.id}:${i}`, x, y: h(x) + lift }
  })
  cache.set(env.id, stars)
  return stars
}
