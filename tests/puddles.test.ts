import { describe, expect, it } from 'vitest'
import { ENVIRONMENTS, puddlesFor, heightFor } from '../src/data/environments'
import { runabout } from '../src/data/vehicles'
import { flat } from '../src/sim/terrain'
import type { Puddle, VehicleSpec } from '../src/sim/types'
import { Sim } from '../src/sim/world'

const pool: Puddle = { start: 20, end: 45, kind: 'mud', drag: 0.8, grip: 0.6 }
const puddles = (x: number) => (x >= pool.start && x <= pool.end ? pool : null)

/** Seconds of full gas from a standstill to reach x = 60 m. */
function timeTo60(vehicle: VehicleSpec, withPuddle: boolean): number {
  const sim = new Sim({ vehicle, height: flat, puddles: withPuddle ? puddles : undefined })
  for (let i = 1; i <= 60 * 30; i++) {
    const s = sim.state()
    sim.step({ gas: s.chassis.angle < 0.3, brake: false })
    if (sim.state().chassis.x >= 60) return i / 60
  }
  return 30
}

describe('puddles', () => {
  it('slow a normal vehicle down', () => {
    expect(timeTo60(runabout, true)).toBeGreaterThan(timeTo60(runabout, false) + 0.5)
  })

  it('do not slow an amphibious vehicle', () => {
    const rover: VehicleSpec = { ...runabout, amphibious: { minGrip: 0.8 } }
    expect(Math.abs(timeTo60(rover, true) - timeTo60(rover, false))).toBeLessThan(0.05)
  })

  it('lie only on gentle ground, never on the starting flat, the same every time', () => {
    for (const env of ENVIRONMENTS) {
      const fn = puddlesFor(env)
      if (!env.puddles) {
        expect(fn).toBeUndefined()
        continue
      }
      const height = heightFor(env)
      const seen = new Set<Puddle>()
      for (let x = 0; x < 3000; x += 0.5) {
        const p = fn!(x)
        if (!p || seen.has(p)) continue
        seen.add(p)
        expect(p.start).toBeGreaterThan(60)
        expect(Math.abs(height(p.end) - height(p.start)) / (p.end - p.start)).toBeLessThan(0.12)
      }
      expect(seen.size).toBeGreaterThan(3)
      expect(fn!(1234.5)).toBe(puddlesFor(env)!(1234.5))
    }
  })
})
