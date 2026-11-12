import { describe, expect, it } from 'vitest'
import { fixedPickups, PickupField } from '../src/data/track'
import { flat } from '../src/sim/terrain'

describe('distance to the next fuel can', () => {
  it('finds the next can ahead, generating it if needed, and skips taken ones', () => {
    const field = new PickupField(flat, 1)
    const first = field.nextFuel(0)!
    expect(first).toBe(140)
    const fuel = field.items.find((p) => p.kind === 'fuel' && p.x === first)!
    expect(field.nextFuel(first + 1)).toBeGreaterThan(first)
    fuel.taken = true
    expect(field.nextFuel(0)).toBeGreaterThan(first)
    // Far out, where cans are far apart, it still finds one.
    expect(field.nextFuel(5000)).toBeGreaterThan(5000)
  })

  it('works on a fixed list, and says null when there is none', () => {
    const list = fixedPickups([{ kind: 'fuel', x: 30, y: 1, value: 0 }])
    expect(list.nextFuel(0)).toBe(30)
    expect(list.nextFuel(31)).toBeNull()
  })
})
