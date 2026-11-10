import { describe, expect, it } from 'vitest'
import { layPickups, type Pickup } from '../src/data/track'
import { runabout } from '../src/data/vehicles'
import { Run, RULES } from '../src/sim/run'
import { flat, testHills } from '../src/sim/terrain'
import type { Input } from '../src/sim/types'
import { STEP } from '../src/sim/world'

const GAS: Input = { gas: true, brake: false }
const NONE: Input = { gas: false, brake: false }

function drive(run: Run, input: Input | (() => Input), seconds: number) {
  for (let i = 0; i < seconds / STEP && run.status === 'running'; i++) run.step(typeof input === 'function' ? input() : input)
}

describe('run rules', () => {
  it('collects coins it drives through and pays their value', () => {
    const pickups: Pickup[] = [10, 11.3, 12.6].map((x) => ({ kind: 'coin', x, y: 0.9, value: 5 }))
    const run = new Run({ vehicle: runabout, height: flat, pickups, bestDistance: 1000 })
    drive(run, GAS, 5)
    expect(run.coins.track).toBe(15)
    expect(run.taken).toEqual([true, true, true])
  })

  it('runs out of fuel and ends the run once stopped; a fuel can refills the tank', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: [], bestDistance: 1e9 })
    drive(run, GAS, RULES.fuelSecondsOnGas + RULES.outOfFuelTimeout + 2)
    expect(run.status).toBe('outOfFuel')

    const refuel = new Run({ vehicle: runabout, height: flat, pickups: [{ kind: 'fuel', x: 30, y: 0.9, value: 0 }], bestDistance: 1e9 })
    refuel.fuel = 0.2
    drive(refuel, GAS, 6)
    expect(refuel.fuel).toBeGreaterThan(0.9)
  })

  it('ends the run when the driver lands on their head', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: [], bestDistance: 1e9 })
    // Spin nose-up in the air and keep spinning: lands on the roof.
    run.sim.vehicle.chassis.setPosition({ x: 0, y: 6 })
    for (const w of run.sim.vehicle.wheels) w.setPosition({ x: w.getPosition().x, y: w.getPosition().y + 5 })
    drive(run, GAS, 4)
    expect(run.status).toBe('crashed')
  })

  it('pays for air time and a landed flip', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: [], bestDistance: 1e9 })
    const chassis = run.sim.vehicle.chassis
    const lift = 30
    chassis.setPosition({ x: 0, y: chassis.getPosition().y + lift })
    for (const w of run.sim.vehicle.wheels) w.setPosition({ x: w.getPosition().x, y: w.getPosition().y + lift })
    // One full turn nose-up, then hold the car level until it lands.
    drive(run, () => {
      const turned = chassis.getAngle()
      if (turned < Math.PI * 2 - 0.1) return GAS
      return chassis.getAngularVelocity() > 0.2 ? { gas: false, brake: true } : NONE
    }, 6)
    expect(run.status).toBe('running')
    expect(run.coins.flips).toBe(RULES.coinsPerFlip)
    expect(run.coins.air).toBeGreaterThanOrEqual(RULES.airCoinsPerSecond)
  })

  it('pays a milestone bonus only beyond the best distance so far', () => {
    const first = new Run({ vehicle: runabout, height: flat, pickups: [], bestDistance: 0 })
    drive(first, GAS, 25)
    expect(first.coins.milestones).toBe(RULES.milestoneBonus(1) + RULES.milestoneBonus(2))
    const again = new Run({ vehicle: runabout, height: flat, pickups: [], bestDistance: 150 })
    drive(again, GAS, 25)
    expect(again.coins.milestones).toBe(RULES.milestoneBonus(2))
  })

  it('lays the same coins and fuel cans every time, with fuel cans further apart further out', () => {
    const a = layPickups(testHills, 4000)
    expect(layPickups(testHills, 4000)).toEqual(a)
    const fuel = a.filter((p) => p.kind === 'fuel').map((p) => p.x)
    for (let i = 2; i < fuel.length; i++) expect(fuel[i] - fuel[i - 1]).toBeGreaterThan(fuel[i - 1] - fuel[i - 2])
    expect(a.filter((p) => p.kind === 'coin').length).toBeGreaterThan(200)
  })
})
