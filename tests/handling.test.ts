import { describe, expect, it } from 'vitest'
import { runabout } from '../src/data/vehicles'
import { flat, testHills } from '../src/sim/terrain'
import type { Input } from '../src/sim/types'
import { Sim, STEP } from '../src/sim/world'

const NONE: Input = { gas: false, brake: false }
const GAS: Input = { gas: true, brake: false }
const BRAKE: Input = { gas: false, brake: true }

function run(sim: Sim, input: Input, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    sim.step(input)
    each?.()
  }
}

describe('runabout handling', () => {
  it('settles upright and stays put with no input', () => {
    const sim = new Sim({ vehicle: runabout, height: flat })
    run(sim, NONE, 3)
    const s = sim.state()
    expect(Math.abs(s.chassis.angle)).toBeLessThan(0.08)
    expect(Math.abs(s.speed)).toBeLessThan(0.05)
    expect(s.wheelContacts).toEqual([true, true])
  })

  it('accelerates forward under gas', () => {
    const sim = new Sim({ vehicle: runabout, height: flat })
    run(sim, NONE, 1)
    run(sim, GAS, 3)
    const s = sim.state()
    expect(s.speed).toBeGreaterThan(8)
    expect(s.distance).toBeGreaterThan(12)
  })

  it('lifts the nose under full gas but never flips on flat ground, whenever the pedal goes down', () => {
    // The launch wheelie must not depend on suspension phase at the moment of pressing gas.
    for (let restSteps = 0; restSteps <= 120; restSteps += 6) {
      const sim = new Sim({ vehicle: runabout, height: flat })
      for (let i = 0; i < restSteps; i++) sim.step(NONE)
      let maxPitch = 0
      run(sim, GAS, 6, () => (maxPitch = Math.max(maxPitch, sim.state().chassis.angle)))
      expect(maxPitch, `rest ${restSteps} steps`).toBeGreaterThan(0.08)
      expect(maxPitch, `rest ${restSteps} steps`).toBeLessThan(0.6)
    }
  })

  it('brakes to a stop and then reverses', () => {
    const sim = new Sim({ vehicle: runabout, height: flat })
    run(sim, NONE, 1)
    run(sim, GAS, 3)
    run(sim, BRAKE, 4)
    expect(sim.state().speed).toBeLessThan(-1)
  })

  it('rotates nose-up on gas and nose-down on brake in the air', () => {
    const air = (input: Input) => {
      const sim = new Sim({ vehicle: runabout, height: flat, start: { x: 0, y: 40 } })
      run(sim, input, 0.6)
      expect(sim.state().airborne).toBe(true)
      return sim.state().chassis.angle
    }
    expect(air(GAS)).toBeGreaterThan(0.5)
    expect(air(BRAKE)).toBeLessThan(-0.5)
    expect(Math.abs(air(NONE))).toBeLessThan(0.05)
  })

  it('caps air spin', () => {
    const sim = new Sim({ vehicle: runabout, height: flat, start: { x: 0, y: 200 } })
    run(sim, GAS, 3)
    const spin = sim.vehicle.chassis.getAngularVelocity()
    expect(spin).toBeGreaterThan(runabout.airControl.maxSpin * 0.8)
    expect(spin).toBeLessThan(runabout.airControl.maxSpin * 1.15)
  })

  it('can be driven over the hill test track by feathering the pedals', () => {
    // A simple driver: ease off when the nose is high, and level the car in the air.
    const sim = new Sim({ vehicle: runabout, height: testHills })
    let worstPitch = 0
    for (let i = 0; i < 30 / STEP; i++) {
      const s = sim.state()
      const pitch = s.chassis.angle
      worstPitch = Math.max(worstPitch, Math.abs(pitch))
      if (s.airborne) sim.step({ gas: pitch < -0.15, brake: pitch > 0.15 })
      else {
        // On the ground, judge the nose against the slope under the car.
        const x = s.chassis.x
        const slope = Math.atan((testHills(x + 1) - testHills(x - 1)) / 2)
        sim.step({ gas: pitch - slope < 0.35, brake: false })
      }
    }
    expect(sim.state().distance).toBeGreaterThan(200)
    expect(worstPitch).toBeLessThan(Math.PI / 2)
  })

  it('is deterministic', () => {
    const drive = () => {
      const sim = new Sim({ vehicle: runabout, height: testHills })
      run(sim, GAS, 4)
      run(sim, BRAKE, 1)
      run(sim, GAS, 3)
      return sim.state()
    }
    expect(drive()).toEqual(drive())
  })
})
