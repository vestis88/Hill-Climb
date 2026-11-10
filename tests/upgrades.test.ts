import { describe, expect, it } from 'vitest'
import { runabout, runaboutFull } from '../src/data/vehicles'
import { applyUpgrades, BASE_LEVELS, FULL_LEVELS, MAX_LEVEL, price, type Levels, type UpgradeId } from '../src/data/upgrades'
import { flat } from '../src/sim/terrain'
import type { Input, VehicleSpec } from '../src/sim/types'
import { Sim } from '../src/sim/world'

const GAS: Input = { gas: true, brake: false }
const NONE: Input = { gas: false, brake: false }
const at = (levels: Partial<Levels>) => applyUpgrades(runabout, runaboutFull, { ...BASE_LEVELS, ...levels })

function run(sim: Sim, input: Input, steps: number, each?: () => void) {
  for (let i = 0; i < steps; i++) {
    sim.step(input)
    each?.()
  }
}

const topSpeed = (v: VehicleSpec) => {
  const sim = new Sim({ vehicle: v, height: flat })
  run(sim, GAS, 900)
  return sim.state().speed
}

/** Metres travelled up a constant slope from a standstill in 10 s of full gas. */
const climb = (v: VehicleSpec, deg: number) => {
  const k = Math.tan((deg * Math.PI) / 180)
  const ramp = (x: number) => (x < 5 ? 0 : x < 7 ? (k * (x - 5) ** 2) / 4 : k * (x - 6))
  const sim = new Sim({ vehicle: v, height: ramp })
  run(sim, GAS, 600)
  return sim.state().chassis.x
}

/** Total up-and-down chassis travel in the 1.5 s after landing a 2 m drop: less is a cleaner landing. */
const landingBounce = (v: VehicleSpec) => {
  const sim = new Sim({ vehicle: v, height: flat, start: { x: 0, y: 3 } })
  while (!sim.state().wheelContacts.some(Boolean)) sim.step(NONE)
  let travel = 0
  let y = sim.state().chassis.y
  run(sim, NONE, 90, () => {
    const ny = sim.state().chassis.y
    travel += Math.abs(ny - y)
    y = ny
  })
  return travel
}

/** Worst nose-up angle when flooring it from a standstill, over many pedal timings. */
const worstLaunchPitch = (v: VehicleSpec) => {
  let worst = 0
  for (let rest = 0; rest <= 120; rest += 12) {
    const sim = new Sim({ vehicle: v, height: flat })
    run(sim, NONE, rest)
    run(sim, GAS, 480, () => (worst = Math.max(worst, sim.state().chassis.angle)))
  }
  return worst
}

describe('upgrades', () => {
  it('level 1 everywhere is exactly the base car, and the top level is the full car', () => {
    expect(applyUpgrades(runabout, runaboutFull, BASE_LEVELS)).toEqual(runabout)
    expect(applyUpgrades(runabout, runaboutFull, FULL_LEVELS)).toEqual(runaboutFull)
  })

  it('prices rise with every level', () => {
    for (let level = 3; level <= MAX_LEVEL; level++) expect(price(level)).toBeGreaterThan(price(level - 1))
    expect(price(2)).toBe(300)
  })

  it('engine levels raise top speed step by step', () => {
    let last = 0
    for (let level = 1; level <= MAX_LEVEL; level += 3) {
      const speed = topSpeed(at({ engine: level }))
      expect(speed).toBeGreaterThan(last)
      last = speed
    }
    expect(last * 3.6).toBeGreaterThan(60)
  })

  it('tyres and drivetrain each climb steeper slopes than the base car', () => {
    const base = climb(runabout, 30)
    expect(climb(at({ tyres: MAX_LEVEL }), 30)).toBeGreaterThan(base + 5)
    expect(climb(at({ drivetrain: MAX_LEVEL }), 30)).toBeGreaterThan(base + 5)
  })

  it('suspension gives cleaner landings', () => {
    expect(landingBounce(at({ suspension: MAX_LEVEL }))).toBeLessThan(landingBounce(runabout) * 0.9)
  })

  it('the fully upgraded car is much better all round', () => {
    expect(topSpeed(runaboutFull) * 3.6).toBeGreaterThan(60)
    expect(climb(runaboutFull, 40)).toBeGreaterThan(30)
  })

  it('never flips over backwards from a standstill on flat ground, whatever the upgrades', () => {
    // Kids hold the gas; that alone must not flip the car. Hills still need skill.
    const ids: UpgradeId[] = ['engine', 'tyres', 'suspension', 'drivetrain']
    const combos: Partial<Levels>[] = [{}, FULL_LEVELS, ...ids.map((id) => ({ [id]: MAX_LEVEL }))]
    combos.push({ engine: MAX_LEVEL, drivetrain: MAX_LEVEL }, { engine: MAX_LEVEL, tyres: MAX_LEVEL, drivetrain: MAX_LEVEL })
    for (const levels of combos) expect(worstLaunchPitch(at(levels)), JSON.stringify(levels)).toBeLessThan(1)
  }, 60000)
})
