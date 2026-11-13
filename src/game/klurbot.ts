import type { PuzzleLevel } from '../data/klurbanor'
import { applyUpgrades, type Levels } from '../data/upgrades'
import { vehicleEntry } from '../data/vehicles'
import { fixedPickups } from '../data/track'
import { Run } from '../sim/run'
import type { Input, VehicleSpec } from '../sim/types'
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
    level: { geom: level.geom, start: level.start, gems: level.gems, goal: level.goal, goalOnGround: level.goalOnGround },
  })
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
    while (p && (p.speed >= 0 ? x >= p.x : x <= p.x)) p = level.plan[++k]
    p ??= level.plan[level.plan.length - 1]
    const a = wrap(s.chassis.angle)
    const vx = run.sim.vehicle.chassis.getLinearVelocity().x
    let input: Input
    if (run.sim.inLoop) input = { gas: true, brake: false }
    else if (s.airborne) {
      const target = p.air ?? 0
      input = { gas: a < target - 0.12, brake: a > target + 0.12 }
    } else if (p.pump && pumped < p.pump) {
      // Rock: drive with the motion, so each swing goes a little higher.
      pumped += STEP
      // Coast back (the reverse gear is slower than a good backswing), gas forwards.
      input = vx >= 0 ? { gas: !(a > 0.9), brake: false } : { gas: false, brake: vx > -2 }
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
