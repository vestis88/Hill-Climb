import type { Input } from './types'

/**
 * A scripted rider's pedals in the air (tests, level design, stage timing): bring the nose to
 * `target` (rad) by steering the spin rate, not just the angle. The pedals change the spin
 * gradually (sim/vehicle.ts), so a bang-bang "gas while below, brake while above" would
 * overshoot; this aims for a spin that closes the gap and eases off near it.
 */
export function airPedals(angle: number, spin: number, target = 0): Input {
  const want = Math.max(-3, Math.min(3, (target - angle) * 4))
  return { gas: spin < want - 0.25, brake: spin > want + 0.25 }
}
