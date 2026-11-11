import { describe, expect, it } from 'vitest'
import { fixedPickups, PickupField, type Pickup } from '../src/data/track'
import { runabout, scrambler } from '../src/data/vehicles'
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
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups(pickups), bestDistance: 1000 })
    drive(run, GAS, 5)
    expect(run.coins.track).toBe(15)
    expect(pickups.map((p) => p.taken)).toEqual([true, true, true])
  })

  it('runs out of fuel, rolls on, and ends the run once stopped; a fuel can refills the tank', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
    drive(run, GAS, RULES.fuelSecondsOnGas + 1)
    expect(run.fuel).toBe(0)
    // Still rolling a second after the tank ran dry.
    expect(run.status).toBe('running')
    drive(run, GAS, 60)
    expect(run.status).toBe('outOfFuel')

    const refuel = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([{ kind: 'fuel', x: 30, y: 0.9, value: 0 }]), bestDistance: 1e9 })
    refuel.fuel = 0.2
    drive(refuel, GAS, 6)
    expect(refuel.fuel).toBeGreaterThan(0.9)
    expect(refuel.coins.rescue).toBe(0)
  })

  it('on an empty tank keeps rolling downhill, and a can reached on empty refuels and pays a bonus', () => {
    const downhill = (x: number) => -0.2 * x
    const can: Pickup = { kind: 'fuel', x: 30, y: -6 + 0.9, value: 0 }
    const run = new Run({ vehicle: runabout, height: downhill, pickups: fixedPickups([can]), bestDistance: 1e9 })
    run.fuel = 0
    drive(run, NONE, 10)
    expect(run.status).toBe('running')
    expect(can.taken).toBe(true)
    expect(run.fuel).toBeGreaterThan(0.8)
    expect(run.coins.rescue).toBe(RULES.emptyRescueBonus)
    expect(run.totalCoins).toBeGreaterThanOrEqual(RULES.emptyRescueBonus)
  })

  it('on an empty tank the gas does nothing and the brake cannot reverse', () => {
    for (const input of [GAS, { gas: false, brake: true }]) {
      const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
      run.fuel = 0
      drive(run, NONE, 0.5)
      for (let i = 0; i < 120 && run.status === 'running'; i++) run.step(input)
      expect(Math.abs(run.sim.vehicle.chassis.getPosition().x)).toBeLessThan(0.3)
      expect(run.status).toBe('outOfFuel')
    }
  })

  it('ends the run when the driver lands on their head', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
    // Spin nose-up in the air and keep spinning: lands on the roof.
    run.sim.vehicle.chassis.setPosition({ x: 0, y: 6 })
    for (const w of run.sim.vehicle.wheels) w.setPosition({ x: w.getPosition().x, y: w.getPosition().y + 5 })
    drive(run, GAS, 4)
    expect(run.status).toBe('crashed')
    expect(run.endDistance).not.toBeNull()
    // The driver goes limp and the physics keeps running for the crash to be seen.
    expect(run.ragdoll).not.toBeNull()
    for (let i = 0; i < 120; i++) run.step(NONE)
    const { head, torso } = run.ragdoll!.poses()
    for (const v of [head.x, head.y, torso.x, torso.y]) expect(Number.isFinite(v)).toBe(true)
    expect(Math.hypot(head.x - torso.x, head.y - torso.y)).toBeLessThan(1)
  })

  it('sways the driver back when accelerating hard', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
    drive(run, NONE, 1)
    let maxLean = 0
    for (let i = 0; i < 60; i++) {
      run.step(GAS)
      maxLean = Math.max(maxLean, run.sway.lean)
    }
    expect(maxLean).toBeGreaterThan(0.05)
    expect(maxLean).toBeLessThanOrEqual(0.5)
  })

  it('pays for air time and a landed flip', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
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
    expect(run.coins.flips).toBe(RULES.flipPayout(1))
    expect(run.coins.air).toBeGreaterThanOrEqual(RULES.airCoinsPerSecond)
  })

  it('counts a flip that lands on a steep downslope (rotation measured against the ground)', () => {
    // A 35 degree downslope. Owner report: flips were not always counted. Measured against the
    // horizon, this backflip turned only about 311 degrees and was missed.
    const slope = (x: number) => -0.7 * x
    const run = new Run({ vehicle: runabout, height: slope, pickups: fixedPickups([]), bestDistance: 1e9 })
    const chassis = run.sim.vehicle.chassis
    const lift = { x: 10, y: slope(10) + 14 }
    const dx = lift.x - chassis.getPosition().x
    const dy = lift.y - chassis.getPosition().y
    for (const b of [chassis, ...run.sim.vehicle.wheels]) b.setPosition({ x: b.getPosition().x + dx, y: b.getPosition().y + dy })
    const groundAngle = Math.atan(-0.7)
    // One backflip, then line the car up with the slope and hold it there until it lands.
    drive(run, () => {
      const rel = chassis.getAngle() - groundAngle
      if (rel < Math.PI * 2 - 0.15) return GAS
      return chassis.getAngularVelocity() > 0.2 ? { gas: false, brake: true } : NONE
    }, 5)
    expect(run.status).toBe('running')
    expect(run.coins.flips).toBe(RULES.flipPayout(1))
  })

  it('pays 100, 300, 900 and 2000 for single to quad flips', () => {
    expect([1, 2, 3, 4].map(RULES.flipPayout)).toEqual([100, 300, 900, 2000])
    expect(RULES.flipPayout(5)).toBeGreaterThan(2000)
  })

  it('counts a double backflip as one double, not two singles', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
    const chassis = run.sim.vehicle.chassis
    for (const b of [chassis, ...run.sim.vehicle.wheels]) b.setPosition({ x: b.getPosition().x, y: b.getPosition().y + 160 })
    let events: string[] = []
    drive(run, () => {
      events = events.concat(run.events.filter((e) => e.kind === 'flip').map((e) => (e.kind === 'flip' ? `${e.flips} ${e.direction}` : '')))
      if (chassis.getAngle() < Math.PI * 4 - 0.1) return GAS
      return chassis.getAngularVelocity() > 0.2 ? { gas: false, brake: true } : NONE
    }, 10)
    events = events.concat(run.events.filter((e) => e.kind === 'flip').map((e) => (e.kind === 'flip' ? `${e.flips} ${e.direction}` : '')))
    expect(run.status).toBe('running')
    expect(events).toEqual(['2 back'])
    expect(run.coins.flips).toBe(300)
  })

  it('pays for a wheelie by distance, from 10 m', () => {
    // A car tuned to wheelie easily, driven to hold the nose up: gas while it is low, ease off when high.
    const vehicle = structuredClone(runabout)
    vehicle.airControl.groundTorque = 60
    const run = new Run({ vehicle, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
    drive(run, () => ({ gas: run.sim.vehicle.chassis.getAngle() < 0.45, brake: false }), 6)
    drive(run, { gas: false, brake: true }, 2)
    expect(run.status).toBe('running')
    expect(run.coins.wheelies).toBeGreaterThanOrEqual(RULES.minWheelie * RULES.wheelieCoinsPerMetre)
  })

  it('pays the bike 2 coins per metre of a feathered wheelie', () => {
    const run = new Run({ vehicle: scrambler, height: flat, gravity: 9, pickups: fixedPickups([]), bestDistance: 1e9 })
    const wheelies: { value: number; metres: number }[] = []
    let start = 0
    let x0: number | null = null
    for (let i = 0; i < 600 && run.status === 'running'; i++) {
      const s = run.sim.state()
      if (x0 === null && !s.wheelContacts[1] && s.speed > 1.5) {
        x0 = s.chassis.x
        start = i
      }
      run.step(i < 420 ? { gas: s.chassis.angle < 0.6, brake: false } : { gas: false, brake: false })
      for (const e of run.events) if (e.kind === 'wheelie') wheelies.push(e)
    }
    expect(start).toBeGreaterThan(0)
    expect(wheelies.length).toBeGreaterThan(0)
    const longest = wheelies.reduce((a, b) => (b.metres > a.metres ? b : a))
    expect(longest.metres).toBeGreaterThan(RULES.minWheelie)
    expect(longest.value).toBe(Math.floor(longest.metres * RULES.wheelieCoinsPerMetre))
  })

  it('pays a milestone bonus only beyond the best distance so far', () => {
    const first = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 0 })
    drive(first, GAS, 25)
    expect(first.coins.milestones).toBe(RULES.milestoneBonus(1) + RULES.milestoneBonus(2))
    const again = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 150 })
    drive(again, GAS, 25)
    expect(again.coins.milestones).toBe(RULES.milestoneBonus(2))
  })

  it('lays the same coins and fuel cans every time, with fuel cans further apart further out', () => {
    const lay = () => {
      const field = new PickupField(testHills)
      field.ensure(2000)
      field.ensure(4000)
      return field.items
    }
    const a = lay()
    expect(lay()).toEqual(a)
    for (let i = 1; i < a.length; i++) expect(a[i].x).toBeGreaterThan(a[i - 1].x)
    const fuel = a.filter((p) => p.kind === 'fuel').map((p) => p.x)
    for (let i = 2; i < fuel.length; i++) expect(fuel[i] - fuel[i - 1]).toBeGreaterThan(fuel[i - 1] - fuel[i - 2])
    expect(a.filter((p) => p.kind === 'coin').length).toBeGreaterThan(200)
  })
})

describe('flips on the bike (regression: hard landings used to erase full turns)', () => {
  it('pays every full flip the Scrambler lands, back and front, on several maps', async () => {
    const { environment, heightFor } = await import('../src/data/environments')
    const { scramblerFull } = await import('../src/data/vehicles')
    let landed = 0
    let paid = 0
    for (const envId of ['meadow', 'crater']) {
      const env = environment(envId)
      const height = heightFor(env)
      for (let k = 0; k < 12; k++) {
        const dir = k % 2 ? -1 : 1
        const x0 = 120 + k * 37
        const run = new Run({ vehicle: scramblerFull, height, gravity: env.gravity, groundFriction: env.groundFriction, pickups: fixedPickups([]), bestDistance: 1e9 })
        const c = run.sim.vehicle.chassis
        const y0 = height(x0) + 14
        for (const b of [c, ...run.sim.vehicle.wheels]) {
          b.setPosition({ x: b.getPosition().x + x0, y: b.getPosition().y + y0 })
          b.setLinearVelocity({ x: 9, y: 4 })
        }
        let flips = 0
        let down = false
        for (let i = 0; i < 360 && run.status === 'running'; i++) {
          const s = run.sim.state()
          const turned = s.chassis.angle * dir
          const slope = Math.atan2(height(s.chassis.x + 0.5) - height(s.chassis.x - 0.5), 1)
          const rel = Math.atan2(Math.sin(s.chassis.angle - slope), Math.cos(s.chassis.angle - slope))
          let input = { gas: false, brake: false }
          if (s.airborne && !down) {
            if (turned < 2 * Math.PI - 0.5) input = dir > 0 ? { gas: true, brake: false } : { gas: false, brake: true }
            else input = rel > 0.1 ? { gas: false, brake: true } : rel < -0.1 ? { gas: true, brake: false } : input
          }
          run.fuel = 1
          run.step(input)
          for (const e of run.events) if (e.kind === 'flip') flips += e.flips
          if (!run.sim.state().airborne && i > 10) down = true
        }
        if (run.status === 'running' && Math.abs(run.sim.state().chassis.angle) > 4.5) {
          landed++
          if (flips >= 1) paid++
        }
      }
    }
    expect(landed).toBeGreaterThan(8)
    expect(paid).toBe(landed)
  }, 60000)
})
