import { describe, expect, it } from 'vitest'
import { ENVIRONMENTS } from '../src/data/environments'
import { runabout, runaboutFull, VEHICLES } from '../src/data/vehicles'
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

/** Metres to stop from top speed after 4 s of gas, braking on flat ground. */
const brakingDistance = (v: VehicleSpec) => {
  const sim = new Sim({ vehicle: v, height: flat })
  run(sim, GAS, 240)
  const x0 = sim.state().chassis.x
  for (let i = 0; i < 600 && sim.state().speed > 0.2; i++) sim.step({ gas: false, brake: true })
  return sim.state().chassis.x - x0
}

/** Seconds of full gas from a standstill to reach the given speed (m/s). */
const timeTo = (v: VehicleSpec, speed: number) => {
  const sim = new Sim({ vehicle: v, height: flat })
  for (let i = 1; i <= 900; i++) {
    sim.step(GAS)
    if (sim.state().speed >= speed) return i / 60
  }
  return 15
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
const worstLaunchPitch = (v: VehicleSpec, gravity = 10) => {
  let worst = 0
  for (let rest = 0; rest <= 120; rest += 12) {
    const sim = new Sim({ vehicle: v, height: flat, gravity })
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

})

describe.each(VEHICLES)('every vehicle: $name', (entry) => {
  const at = (levels: Partial<Levels>) => applyUpgrades(entry.base, entry.full, { ...BASE_LEVELS, ...levels })

  it('settles upright on its wheels at rest', () => {
    const sim = new Sim({ vehicle: entry.base, height: flat })
    run(sim, NONE, 180)
    expect(Math.abs(sim.state().chassis.angle)).toBeLessThan(0.1)
    expect(sim.state().wheelContacts.every(Boolean)).toBe(true)
  })

  it('level 1 is the base spec and the top level the full spec', () => {
    expect(at({})).toEqual(entry.base)
    expect(at(FULL_LEVELS)).toEqual(entry.full)
  })

  it('offers four upgrades that suit it', () => {
    expect(entry.upgrades).toHaveLength(4)
    expect(entry.upgrades.map((u) => u.id).slice(0, 3)).toEqual(['engine', 'tyres', 'suspension'])
  })

  it('engine raises top speed; tyres, the fourth upgrade and the full set each help', () => {
    expect(topSpeed(at({ engine: MAX_LEVEL }))).toBeGreaterThan(topSpeed(entry.base) * 1.5)
    // Tyres: climb further up a steep slope, or stop shorter (on the light bike the engine,
    // not grip, limits steep climbs, so braking shows the gain).
    const base = climb(entry.base, 30)
    const tyres = at({ tyres: MAX_LEVEL })
    expect(climb(tyres, 30) > base + 1 || brakingDistance(tyres) < brakingDistance(entry.base) * 0.9).toBe(true)
    const fourth = entry.upgrades[3].id
    if (fourth === 'drivetrain') expect(climb(at({ drivetrain: MAX_LEVEL }), 30)).toBeGreaterThan(base + 1)
    if (fourth === 'weight') {
      // Less weight: quicker off the line. (On the light bike it also means less grip on
      // climbs; the stage-time test checks that the upgrades still make runs quicker overall.)
      expect(timeTo(at({ weight: MAX_LEVEL }), 7)).toBeLessThan(timeTo(entry.base, 7) * 0.95)
    }
    // The fully upgraded vehicle climbs clearly further up a 25 degree slope. (The light bike is
    // engine-limited on steeper slopes; tests/stages.test.ts checks it is much quicker overall.)
    expect(climb(entry.full, 25)).toBeGreaterThan(climb(entry.base, 25) * 1.3)
  })

  it('an upgrade it does not offer changes nothing', () => {
    const offered = new Set(entry.upgrades.map((u) => u.id))
    for (const id of ['drivetrain', 'weight'] as UpgradeId[]) {
      if (!offered.has(id)) expect(at({ [id]: MAX_LEVEL })).toEqual(entry.base)
    }
  })

  it('suspension gives cleaner landings', () => {
    expect(landingBounce(at({ suspension: MAX_LEVEL }))).toBeLessThan(landingBounce(entry.base))
  })

  it.runIf(entry.launchSafe)('beginner-safe: does not flip backwards from a standstill at base, full or any single upgrade', () => {
    // Owner: launch backflips are fine for some vehicles (feathering is the skill), but not all.
    // Mixed in-between setups may flip; Crater Fields, the low-gravity map, is excepted.
    const ids = entry.upgrades.map((u) => u.id)
    const combos: Partial<Levels>[] = [{}, FULL_LEVELS, ...ids.map((id) => ({ [id]: MAX_LEVEL }))]
    const gravities = [...new Set(ENVIRONMENTS.filter((e) => e.id !== 'crater').map((e) => e.gravity))]
    for (const g of gravities) {
      for (const levels of combos) expect(worstLaunchPitch(at(levels), g), `${JSON.stringify(levels)} at gravity ${g}`).toBeLessThan(1)
    }
  }, 180000)
})
