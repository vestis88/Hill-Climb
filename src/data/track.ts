import { rng } from '../sim/rng'
import type { HeightFn } from '../sim/types'

export interface Pickup {
  kind: 'coin' | 'fuel'
  x: number
  y: number
  /** Coins for a coin; unused for fuel. */
  value: number
}

/** Coin value by distance: further out is worth more. */
export function coinValue(x: number): number {
  if (x < 300) return 5
  if (x < 700) return 10
  if (x < 1200) return 25
  return 50
}

/**
 * Deterministic pickups for a track: fuel cans further apart the further you
 * get, and groups of five coins in between. Same seed, same layout.
 */
export function layPickups(height: HeightFn, length: number, seed = 1): Pickup[] {
  const random = rng(seed)
  const pickups: Pickup[] = []

  const fuelXs: number[] = []
  for (let x = 140, k = 0; x < length; k++, x += 160 + 35 * k) fuelXs.push(x)
  for (const x of fuelXs) pickups.push({ kind: 'fuel', x, y: height(x) + 0.9, value: 0 })

  for (let x = 25; x < length - 10; x += 35 + random() * 30) {
    if (fuelXs.some((f) => Math.abs(f - x) < 12)) continue
    for (let i = 0; i < 5; i++) {
      const cx = x + i * 1.3
      pickups.push({ kind: 'coin', x: cx, y: height(cx) + 0.9, value: coinValue(cx) })
    }
  }
  return pickups.sort((a, b) => a.x - b.x)
}
