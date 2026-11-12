import { describe, expect, it } from 'vitest'
import { environment, heightFor } from '../src/data/environments'
import { fixedPickups, PickupField } from '../src/data/track'
import { runabout, VEHICLES } from '../src/data/vehicles'
import { Run, type RunEvent } from '../src/sim/run'
import { featureAt, stuntAvoid, stuntHeight, type StuntKind } from '../src/sim/stunt'
import type { Input, VehicleSpec } from '../src/sim/types'
import { STEP } from '../src/sim/world'

/** A seed whose first feature is the given kind (so a run reaches it quickly). */
function seedFirst(kind: StuntKind): number {
  for (let seed = 1; seed < 500; seed++) if (featureAt(0, seed).kind === kind) return seed
  throw new Error(kind)
}

function stuntRun(seed: number, vehicle: VehicleSpec = runabout): Run {
  return new Run({ vehicle, height: stuntHeight(seed), pickups: fixedPickups([]), bestDistance: 1e9, stunt: seed })
}

/**
 * Gas (or `gas(t)`) on the ground, easing off when the nose lifts; in the air, keeps the nose
 * level with the ground below.
 */
function drive(run: Run, seconds: number, gas: (t: number) => boolean = () => true): RunEvent[] {
  const events: RunEvent[] = []
  const h = run.options.height
  for (let i = 0; i < seconds / STEP && run.status === 'running'; i++) {
    const s = run.sim.state()
    const x = s.chassis.x
    const slope = Math.atan((h(x + 1) - h(x - 1)) / 2)
    const a = s.chassis.angle - 2 * Math.PI * Math.round(s.chassis.angle / (2 * Math.PI))
    // Full gas round a loop; level in the air; easing off when the nose lifts on the ground.
    const input: Input = run.sim.inLoop
      ? { gas: gas(i * STEP), brake: false }
      : s.airborne
        ? { gas: a < slope - 0.15, brake: a > slope + 0.15 }
        : { gas: gas(i * STEP) && a - slope < 0.35, brake: false }
    run.step(input)
    events.push(...run.events)
  }
  return events
}

describe('Stuntbanan', () => {
  it('a loop taken at speed goes all the way round and pays', () => {
    const seed = seedFirst('loop')
    const loop = featureAt(0, seed)
    const run = stuntRun(seed)
    const events = drive(run, 20)
    expect(run.sim.state().chassis.x).toBeGreaterThan(loop.start + loop.length)
    expect(events.some((e) => e.kind === 'stunt' && e.what === 'loop')).toBe(true)
    expect(run.coins.stunts).toBeGreaterThanOrEqual(200)
  })

  it('a loop taken too slowly is not completed', () => {
    const seed = seedFirst('loop')
    const run = stuntRun(seed)
    // Two seconds of gas, then coasting down the run-up into it.
    const events = drive(run, 40, (t) => t < 2)
    expect(events.some((e) => e.kind === 'stunt' && e.what === 'loop')).toBe(false)
  })

  it('a pit jumped at speed pays; rolling in slowly ends the run', () => {
    const seed = seedFirst('gap')
    const gap = featureAt(0, seed)
    const fast = stuntRun(seed)
    const events = drive(fast, 15)
    expect(fast.sim.state().chassis.x).toBeGreaterThan(gap.start + gap.length)
    expect(events.some((e) => e.kind === 'stunt' && e.what === 'gap')).toBe(true)

    const slow = stuntRun(seed)
    drive(slow, 60, (t) => t % 1 < 0.2)
    expect(slow.status).toBe('crashed')
    expect(slow.endDistance!).toBeLessThan(gap.start + 8 + gap.size)
  })

  it('a seesaw tips as the vehicle crosses it', () => {
    const seed = seedFirst('seesaw')
    const f = featureAt(0, seed)
    const run = stuntRun(seed)
    let before: number | undefined
    let lowest = Infinity
    for (let i = 0; i < 30 / STEP && run.status === 'running' && run.sim.state().chassis.x < f.start + 20; i++) {
      run.step({ gas: i % 60 < 30, brake: false })
      const x = run.sim.state().chassis.x
      const angle = run.sim.seesawAngles().get('seesaw0')
      if (angle === undefined) continue
      if (x < f.start) before = angle
      else lowest = Math.min(lowest, angle)
    }
    // Rests on its near end, and tips onto its far end once the vehicle is past the pivot.
    expect(before).toBeGreaterThan(0.2)
    expect(lowest).toBeLessThan(-0.2)
    expect(run.status).toBe('running')
  })

  it('most vehicles can drive the first 400 m at full gas with a little balancing', () => {
    const env = environment('stunt')
    let made = 0
    for (const v of VEHICLES) {
      const run = new Run({ vehicle: v.base, height: heightFor(env), gravity: env.gravity, groundFriction: env.groundFriction, pickups: fixedPickups([]), bestDistance: 1e9, stunt: env.seed })
      drive(run, 60)
      if (run.sim.state().distance > 400) made++
    }
    expect(made).toBeGreaterThanOrEqual(VEHICLES.length - 3)
  })

  it('never puts a fuel can in a pit or a loop', () => {
    const env = environment('stunt')
    const avoid = stuntAvoid(env.seed)
    const field = new PickupField(heightFor(env), env.seed, avoid)
    field.ensure(5000)
    for (const p of field.items) expect(avoid(p.x), `${p.kind} at ${p.x}`).toBe(false)
  })
})
