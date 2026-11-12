import { rng } from '../sim/rng'
import type { HeightFn } from '../sim/types'

export interface Pickup {
  kind: 'coin' | 'fuel' | 'turbo'
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
  /** The x of the next fuel can not yet taken ahead of x, or null if there is none. */
  nextFuel(x: number): number | null
}

/** The first untaken fuel can past x in a list of pickups. */
const firstFuel = (items: Pickup[], x: number) => items.find((p) => p.kind === 'fuel' && !p.taken && p.x > x)?.x ?? null

/** Coin value by distance: further out is worth more. */
export function coinValue(x: number): number {
  if (x < 500) return 5
  if (x < 1500) return 10
  return 15
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
        this.nextFuelX = x + 150 + 85 * this.fuelCount
      } else {
        const x = this.nextCoinX
        this.nextCoinX = x + 45 + this.random() * 35
        if (x - this.lastFuelX < 12 || this.nextFuelX - x < 12) continue
        // Now and then a turbo canister in place of a coin row (not in the first 100 m).
        if (x > 100 && this.random() < 0.12) {
          this.items.push({ kind: 'turbo', x: x + 2.6, y: this.height(x + 2.6) + 1, value: 0 })
          continue
        }
        for (let i = 0; i < 5; i++) {
          const cx = x + i * 1.3
          this.items.push({ kind: 'coin', x: cx, y: this.height(cx) + 0.9, value: coinValue(cx) })
        }
      }
    }
  }

  nextFuel(x: number): number | null {
    // Cans are generated lazily; make sure the next one exists (they are never 2 km apart early on).
    for (let ahead = 200; ahead < 20000; ahead *= 2) {
      this.ensure(x + ahead)
      const found = firstFuel(this.items, x)
      if (found !== null) return found
    }
    return null
  }
}

/** A fixed list of pickups, for tests. */
export function fixedPickups(items: Pickup[]): PickupSource {
  return { items, ensure: () => undefined, nextFuel: (x) => firstFuel(items, x) }
}
