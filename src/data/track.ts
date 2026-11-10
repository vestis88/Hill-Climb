import { rng } from '../sim/rng'
import type { HeightFn } from '../sim/types'

export interface Pickup {
  kind: 'coin' | 'fuel'
  x: number
  y: number
  /** Coins for a coin; unused for fuel. */
  value: number
  taken?: boolean
}

/** Something that supplies pickups along the track, in order of x. */
export interface PickupSource {
  readonly items: Pickup[]
  /** Make sure pickups exist up to toX. */
  ensure(toX: number): void
}

/** Coin value by distance: further out is worth more. */
export function coinValue(x: number): number {
  if (x < 300) return 5
  if (x < 700) return 10
  if (x < 1200) return 25
  return 50
}

/**
 * Endless, deterministic pickups: fuel cans further apart the further you get, and
 * groups of five coins in between. Generated lazily as the car advances; each run
 * gets its own field so "taken" flags never leak between runs.
 */
export class PickupField implements PickupSource {
  readonly items: Pickup[] = []
  private readonly random: () => number
  private nextCoinX = 25
  private nextFuelX = 140
  private fuelCount = 0
  private lastFuelX = -Infinity

  constructor(
    private readonly height: HeightFn,
    seed = 1,
  ) {
    this.random = rng(seed)
  }

  ensure(toX: number): void {
    while (Math.min(this.nextCoinX, this.nextFuelX) < toX) {
      if (this.nextFuelX <= this.nextCoinX) {
        const x = this.nextFuelX
        this.items.push({ kind: 'fuel', x, y: this.height(x) + 0.9, value: 0 })
        this.lastFuelX = x
        this.fuelCount++
        this.nextFuelX = x + 160 + 35 * this.fuelCount
      } else {
        const x = this.nextCoinX
        this.nextCoinX = x + 35 + this.random() * 30
        if (x - this.lastFuelX < 12 || this.nextFuelX - x < 12) continue
        for (let i = 0; i < 5; i++) {
          const cx = x + i * 1.3
          this.items.push({ kind: 'coin', x: cx, y: this.height(cx) + 0.9, value: coinValue(cx) })
        }
      }
    }
  }
}

/** A fixed list of pickups, for tests. */
export function fixedPickups(items: Pickup[]): PickupSource {
  return { items, ensure: () => undefined }
}
