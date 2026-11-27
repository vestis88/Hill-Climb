import type { PuzzleLevel } from '../data/klurbanor'
import { applyUpgrades, type Levels } from '../data/upgrades'
import { vehicleEntry } from '../data/vehicles'
import { fixedPickups } from '../data/track'
import { Run } from '../sim/run'
import type { Input, VehicleSpec } from '../sim/types'
import { moverOffset } from '../sim/level'
import { airPedals } from '../sim/pilot'
import { STEP } from '../sim/world'

/** Every Klurbana is driven at this tuning (all upgrades at level 5), so it is about skill. */
export const PUZZLE_LEVELS: Levels = { engine: 5, tyres: 5, suspension: 5, drivetrain: 5, weight: 5, flip: 5, thrust: 5 }

export const PUZZLE_GRAVITY = 9.5
export const PUZZLE_GRIP = 0.95

export function puzzleSpec(vehicleId: string): VehicleSpec {
  const e = vehicleEntry(vehicleId)
  return applyUpgrades(e.base, e.full, PUZZLE_LEVELS)
}

export function puzzleRun(level: PuzzleLevel, vehicle: VehicleSpec, assist = false): Run {
  return new Run({
    vehicle,
    height: () => level.geom.bottom,
    gravity: PUZZLE_GRAVITY,
    groundFriction: PUZZLE_GRIP,
    pickups: fixedPickups([]),
    bestDistance: 1e9,
    assist,
    level: { geom: level.geom, start: level.start, gems: level.gems, goal: level.goal, goalOnGround: level.goalOnGround, goalStill: level.goalStill },
  })
}

/** How fast the moving platform under (x, y) moves sideways at time t, or 0 on solid ground. */
function platformVx(level: PuzzleLevel, t: number, x: number, y: number): number {
  for (const m of level.geom.movers ?? []) {
    const o = moverOffset(m, t)
    if (x < m.x0 + o.x - 1 || x > m.x1 + o.x + 1 || Math.abs(y - (m.y + o.y) - 0.9) > 1.2) continue
    return (moverOffset(m, t + 0.05).x - moverOffset(m, t - 0.05).x) / 0.1
  }
  return 0
}

const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI))

/**
 * The scripted driver (tests and level design): follows the level's plan, holding each step's
 * speed on the ground, full gas round loops, and keeping the nose level in the air.
 * Returns the path it drove and how the run ended.
 */
export function drivePlan(level: PuzzleLevel, vehicleId = 'runabout', limit = 120): { run: Run; path: [number, number][]; step: number } {
  const run = puzzleRun(level, puzzleSpec(vehicleId))
  const path: [number, number][] = []
  let k = 0
  let pumped = 0
  for (let i = 0; i < limit / STEP && run.status === 'running'; i++) {
    const s = run.sim.state()
    const x = s.chassis.x
    let p = level.plan[k]
    const t = i * STEP
    while (p && ((p.below !== undefined && s.chassis.y < p.below) || (p.speed >= 0 ? x >= p.x : x <= p.x)) && (p.wait === undefined || t >= p.wait)) p = level.plan[++k]
    p ??= level.plan[level.plan.length - 1]
    const a = wrap(s.chassis.angle)
    const vx = run.sim.vehicle.chassis.getLinearVelocity().x
    let input: Input
    if (run.sim.inLoop) input = { gas: true, brake: false }
    else if (s.airborne) {
      // Turn the shorter way round to the target angle (upside down is π either way).
      input = airPedals(0, run.sim.vehicle.chassis.getAngularVelocity(), wrap((p.air ?? 0) - a))
    } else if (p.wait !== undefined && (p.speed >= 0 ? x >= p.x : x <= p.x)) {
      // There, and waiting for the time (for a lift, say): stand still on whatever it stands on.
      const rel = vx - platformVx(level, t, x, s.chassis.y)
      // Nearly still: both pedals hold the wheels (so a ferry carries the car along).
      input = Math.abs(rel) < 0.6 ? { gas: true, brake: true } : { gas: rel < 0, brake: rel > 0 }
    } else if (p.coast) {
      input = { gas: false, brake: false }
    } else if (p.pump && pumped < p.pump) {
      // Rock: drive with the motion, so each swing goes a little higher.
      pumped += STEP
      // Coast back (the reverse gear is slower than a good backswing), gas forwards.
      input = vx >= 0 ? { gas: !(a > 0.9), brake: false } : { gas: false, brake: vx > -2 }
    } else if (p.flip) {
      // On a ceiling (upside down): the gas drives the car the other way round, so the pedals
      // swap to keep to the plan's direction.
      input = { gas: vx > p.speed + 0.3, brake: vx < p.speed - 0.3 }
    } else if (p.speed >= 0) {
      const lift = a > 0.55
      input = { gas: vx < p.speed - 0.3 && !lift, brake: vx > p.speed + 1.2 }
    } else {
      input = { gas: vx < p.speed - 1.2, brake: vx > p.speed + 0.3 }
    }
    run.step(input)
    if (i % 6 === 0) path.push([s.chassis.x, s.chassis.y])
  }
  return { run, path, step: k }
}
