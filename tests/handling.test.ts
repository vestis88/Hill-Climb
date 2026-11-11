import { describe, expect, it } from 'vitest'
import { runabout, scrambler, scramblerFull } from '../src/data/vehicles'
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
      expect(maxPitch, `rest ${restSteps} steps`).toBeGreaterThan(0.04)
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

  it('reaches its air spin rate almost at once, then holds it', () => {
    const { spinRate } = runabout.airControl
    for (const input of [GAS, BRAKE]) {
      const dir = input.gas ? 1 : -1
      const sim = new Sim({ vehicle: runabout, height: flat, start: { x: 0, y: 200 } })
      run(sim, input, 0.15)
      expect(sim.vehicle.chassis.getAngularVelocity() * dir).toBeGreaterThan(spinRate * 0.8)
      let peak = 0
      run(sim, input, 3, () => (peak = Math.max(peak, sim.vehicle.chassis.getAngularVelocity() * dir)))
      expect(peak).toBeLessThan(spinRate * 1.05)
    }
  })

  it('keeps its spin when the pedal is released in the air', () => {
    const sim = new Sim({ vehicle: runabout, height: flat, start: { x: 0, y: 200 } })
    run(sim, GAS, 0.5)
    run(sim, NONE, 0.5)
    expect(sim.vehicle.chassis.getAngularVelocity()).toBeGreaterThan(runabout.airControl.spinRate * 0.9)
  })

  it('eases into top speed instead of stopping at a hard limit', () => {
    const sim = new Sim({ vehicle: runabout, height: flat })
    const speeds: number[] = []
    run(sim, GAS, 900, () => speeds.push(sim.state().speed))
    const top = speeds[speeds.length - 1]
    // Still gaining speed in the last stretch before top speed...
    expect(speeds[240] - speeds[120]).toBeGreaterThan(0.3)
    // ...and acceleration fades gradually: no single second takes away most of it.
    const gain = (a: number) => speeds[a + 60] - speeds[a]
    expect(gain(60)).toBeGreaterThan(gain(120))
    expect(gain(120)).toBeGreaterThan(0)
    expect(top).toBeGreaterThan(speeds[180])
  })

  it('has entry-level pace: modest acceleration and top speed', () => {
    const sim = new Sim({ vehicle: runabout, height: flat })
    run(sim, NONE, 1)
    let t8 = 0
    for (let i = 1; i <= 10 / STEP && !t8; i++) {
      sim.step(GAS)
      if (sim.state().speed >= 8) t8 = i * STEP
    }
    run(sim, GAS, 8)
    // Owner playtests 1 and 3 found 63 and 43 km/h too fast; playtest 5 found 33 km/h too low
    // and the hard stop unnatural. Now about 40 km/h, reached by easing in, not a sudden limit.
    expect(t8).toBeGreaterThan(1.6)
    expect(sim.state().speed).toBeGreaterThan(10)
    expect(sim.state().speed).toBeLessThan(12)
  })

  it('can be driven over the hill test track by feathering the pedals', () => {
    // A simple driver: ease off when the nose is high, and level the car in the air.
    const sim = new Sim({ vehicle: runabout, height: testHills })
    let worstPitch = 0
    for (let i = 0; i < 45 / STEP; i++) {
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
    // The opening is meant to be easy; past it the track needs real skill.
    expect(sim.state().distance).toBeGreaterThan(150)
    expect(worstPitch).toBeLessThan(Math.PI / 2)
  })

  it('is limited by grip, not just power, on steep climbs', () => {
    // Owner playtest 2: grip felt excessive. Steepest standing-start climb is now about 25 degrees.
    const climb = (deg: number) => {
      const k = Math.tan((deg * Math.PI) / 180)
      const ramp = (x: number) => (x < 5 ? 0 : x < 7 ? (k * (x - 5) ** 2) / 4 : k * (x - 6))
      const sim = new Sim({ vehicle: runabout, height: ramp })
      run(sim, GAS, 10)
      return sim.state().chassis.x
    }
    expect(climb(25)).toBeGreaterThan(30)
    expect(climb(32)).toBeLessThan(15)
    // With the old grip the same car crawled up 35 degrees, so friction must be what stops it.
    const grippy = structuredClone(runabout)
    grippy.wheels.forEach((w) => (w.friction = 1.6))
    const k = Math.tan((32 * Math.PI) / 180)
    const ramp = (x: number) => (x < 5 ? 0 : x < 7 ? (k * (x - 5) ** 2) / 4 : k * (x - 6))
    const sim = new Sim({ vehicle: grippy, height: ramp })
    run(sim, GAS, 10)
    expect(sim.state().chassis.x).toBeGreaterThan(climb(32) + 5)
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

describe('scrambler suspension', () => {
  it('bottoms out before the tyres reach the mudguards, even off a 10 m drop', () => {
    for (const v of [scrambler, scramblerFull]) {
      const sim = new Sim({ vehicle: v, height: flat, start: { x: 0, y: 10 } })
      let highest = -Infinity
      for (let i = 0; i < 300; i++) {
        sim.step(NONE)
        const { chassis: c, wheels } = sim.state()
        for (const w of wheels) highest = Math.max(highest, -(w.x - c.x) * Math.sin(c.angle) + (w.y - c.y) * Math.cos(c.angle))
      }
      // The hub stops 0.32 m above its anchor (-0.4); art.ts keeps both mudguards clear of
      // a tyre there (top of tyre 0.30, mudguards from 0.38 up).
      expect(highest).toBeLessThan(-0.4 + 0.32 + 0.02)
    }
  })
})
