import type { HeightFn, Input, VehicleSpec } from './types'
import { Sim, STEP } from './world'

/**
 * Times a scripted driver over a stage: from the start to `length` metres. It balances the car
 * in the air and eases off the gas when the nose lifts, trying a few levels of caution and
 * keeping its best time, like a player who learns a car. Used to check that upgrades make
 * runs quicker (npm run stages, tests/stages.test.ts). Fuel is not part of this measurement.
 */
export interface StageResult {
  /** Seconds to finish, or null if every attempt crashed or ran out of time. */
  time: number | null
  caution: number | null
}

export function stageTime(
  vehicle: VehicleSpec,
  height: HeightFn,
  opts: { gravity?: number; airGravity?: number; groundFriction?: number; length?: number; limit?: number; cautions?: number[] } = {},
): StageResult {
  const length = opts.length ?? 500
  const limit = opts.limit ?? 120
  let best: StageResult = { time: null, caution: null }
  for (const caution of opts.cautions ?? [0.15, 0.3, 0.45]) {
    const sim = new Sim({ vehicle, height, gravity: opts.gravity, airGravity: opts.airGravity, groundFriction: opts.groundFriction })
    const headR = vehicle.driver.headRadius
    for (let i = 0; i < limit / STEP; i++) {
      const s = sim.state()
      if (s.chassis.x >= length) {
        const t = i * STEP
        if (best.time === null || t < best.time) best = { time: t, caution }
        break
      }
      const head = sim.vehicle.headPosition()
      if (head.y - headR < height(head.x)) break
      const x = s.chassis.x
      const slope = Math.atan((height(x + 1) - height(x - 1)) / 2)
      const pitch = s.chassis.angle
      const input: Input = s.airborne
        ? { gas: pitch < slope - 0.12, brake: pitch > slope + 0.12 }
        : { gas: pitch - slope < caution, brake: false }
      sim.step(input)
    }
  }
  return best
}
