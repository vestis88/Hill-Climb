import { describe, expect, it } from 'vitest'
import { fixedPickups } from '../src/data/track'
import { runabout } from '../src/data/vehicles'
import { Run } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

describe('parts (Delar)', () => {
  it('Större tank: fuel lasts 30 % longer', () => {
    const a = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
    const b = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9, part: 'tank' })
    for (let i = 0; i < 5 / STEP; i++) {
      a.step({ gas: true, brake: false })
      b.step({ gas: true, brake: false })
    }
    expect(1 - b.fuel).toBeCloseTo((1 - a.fuel) / 1.3, 5)
  })

  it('Myntmagnet: picks up coins from twice as far', () => {
    // A coin high above the track: out of reach normally, in reach with the magnet.
    const coin = () => [{ kind: 'coin' as const, x: 12, y: 3.9, value: 5 }]
    const a = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups(coin()), bestDistance: 1e9 })
    const b = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups(coin()), bestDistance: 1e9, part: 'magnet' })
    for (let i = 0; i < 4 / STEP; i++) {
      a.step({ gas: true, brake: false })
      b.step({ gas: true, brake: false })
    }
    expect(a.coins.track).toBe(0)
    expect(b.coins.track).toBe(5)
  })
})
