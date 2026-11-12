import { describe, expect, it } from 'vitest'
import { fixedPickups } from '../src/data/track'
import { scrambler } from '../src/data/vehicles'
import { Run, RULES } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

const run = (assist: boolean) => new Run({ vehicle: scrambler, height: flat, gravity: 9, pickups: fixedPickups([]), bestDistance: 1e9, assist })

describe('Hjälp for young players', () => {
  it('keeps the bike from looping over backwards on full gas', () => {
    const without = run(false)
    const helped = run(true)
    for (let i = 0; i < 4 / STEP; i++) {
      without.step({ gas: true, brake: false })
      helped.step({ gas: true, brake: false })
    }
    expect(without.status).toBe('crashed')
    expect(helped.status).toBe('running')
  })

  it('makes fuel last longer and forgives too many revs at the start', () => {
    const a = run(false)
    const b = run(true)
    for (let i = 0; i < 10 / STEP; i++) {
      a.step({ gas: false, brake: false })
      b.step({ gas: false, brake: false })
    }
    expect(1 - b.fuel).toBeCloseTo((1 - a.fuel) / RULES.assistFuel, 5)
    expect(run(true).launch(1)).toBe('normal')
  })
})
