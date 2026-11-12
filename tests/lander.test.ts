import { describe, expect, it } from 'vitest'
import { fixedPickups } from '../src/data/track'
import { applyUpgrades, BASE_LEVELS, MAX_LEVEL } from '../src/data/upgrades'
import { lander, landerFull } from '../src/data/vehicles'
import { Run } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

describe('Moon Lander thrusters (owner: a boost button for short bursts)', () => {
  it('lifts off while boosting, runs the tank dry, and refills on the ground', () => {
    const run = new Run({ vehicle: lander, height: flat, gravity: 9, pickups: fixedPickups([]), bestDistance: 1e9 })
    for (let i = 0; i < 30; i++) run.step({ gas: false, brake: false })
    const y0 = run.sim.state().chassis.y
    let top = y0
    for (let i = 0; i < 1 / STEP; i++) {
      run.step({ gas: false, brake: false, boost: true })
      top = Math.max(top, run.sim.state().chassis.y)
    }
    expect(top).toBeGreaterThan(y0 + 0.5)
    for (let i = 0; i < 1 / STEP; i++) run.step({ gas: false, brake: false, boost: true })
    expect(run.thrustLeft).toBe(0)
    for (let i = 0; i < 4 / STEP; i++) run.step({ gas: false, brake: false })
    expect(run.thrustLeft).toBeGreaterThan(1)
  })

  it('the thrust upgrade makes the tank last longer', () => {
    const up = applyUpgrades(lander, landerFull, { ...BASE_LEVELS, thrust: MAX_LEVEL })
    expect(up.thrusters!.seconds).toBeGreaterThan(lander.thrusters!.seconds * 2)
  })
})
