import { describe, expect, it } from 'vitest'
import { fixedPickups } from '../src/data/track'
import { hauler, runabout, scrambler, VEHICLES } from '../src/data/vehicles'
import { EngineRevs, judgeLaunch, LAUNCH } from '../src/sim/launch'
import { Run } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

/** Seconds of full gas from a standstill to 30 m after a start with these revs at GO. */
function to30(revs: number, spec = runabout) {
  const run = new Run({ vehicle: spec, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
  run.launch(revs)
  let t = 0
  while (run.status === 'running' && run.sim.state().distance < 30 && t < 15) {
    run.step({ gas: true, brake: false })
    t += STEP
  }
  return { t, status: run.status }
}

/** Seconds of held gas for the revs to first reach `level` out of gear. */
function revUp(revTime: number, level: number) {
  const e = new EngineRevs(revTime)
  let t = 0
  while (e.free(true, STEP) < level && t < 5) t += STEP
  return t
}

describe('start countdown and launch', () => {
  it('judges the revs at GO: green is perfect, past it is too many', () => {
    expect(judgeLaunch(LAUNCH.idle)).toBe('normal')
    expect(judgeLaunch((LAUNCH.green[0] + LAUNCH.green[1]) / 2)).toBe('perfect')
    expect(judgeLaunch(1)).toBe('over')
  })

  it('a perfect start is quicker, too many revs slower, and neither flips the vehicle', () => {
    for (const v of VEHICLES.filter((e) => e.id !== 'scrambler')) {
      for (const spec of [v.base, v.full]) {
        const normal = to30(LAUNCH.idle, spec)
        const perfect = to30(0.75, spec)
        const over = to30(1, spec)
        expect(perfect.status, v.id).toBe('running')
        expect(over.status, v.id).toBe('running')
        expect(perfect.t, v.id).toBeLessThan(normal.t - 0.2)
        expect(over.t, v.id).toBeGreaterThan(normal.t + 0.1)
        // Too many revs is a drag, not a stall: it still gets away within a second of normal.
        // (A stationary spinning wheel once lost all grip for good: friction compounded.)
        expect(over.t, v.id).toBeLessThan(normal.t + 1)
      }
    }
  })

  it('too many revs spins the driven wheels far faster than the vehicle moves', () => {
    for (const spec of [runabout, hauler]) {
      const run = new Run({ vehicle: spec, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
      run.launch(1)
      for (let i = 0; i < 15; i++) run.step({ gas: true, brake: false })
      const rear = spec.wheels.findIndex((w) => w.axle === 'rear')
      const surface = Math.abs(run.sim.vehicle.wheels[rear].getAngularVelocity()) * spec.wheels[rear].radius
      const ground = Math.abs(run.sim.vehicle.chassis.getLinearVelocity().x)
      expect(surface, spec.id).toBeGreaterThan(2 * ground + 2)
    }
  })

  it('each engine revs at its own pace: the two-stroke snaps up, the V8 swells slowly', () => {
    const two = revUp(scrambler.engine.revTime, 0.95)
    const four = revUp(runabout.engine.revTime, 0.95)
    const v8 = revUp(hauler.engine.revTime, 0.95)
    expect(two).toBeLessThan(four)
    expect(four).toBeLessThan(v8)
    expect(v8).toBeGreaterThan(2.5 * two)
  })

  it('held gas hits the limiter, so the revs must be held in the green by feathering', () => {
    const e = new EngineRevs(runabout.engine.revTime)
    for (let i = 0; i < 120; i++) e.free(true, STEP)
    expect(judgeLaunch(e.revs)).toBe('over')
    // Off the gas the revs sink back to idle.
    for (let i = 0; i < 120; i++) e.free(false, STEP)
    expect(e.revs).toBeLessThan(0.2)
  })
})
