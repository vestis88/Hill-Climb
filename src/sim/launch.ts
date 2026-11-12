/**
 * The start: a 3-2-1 countdown with the vehicle held, while the driver revs the engine.
 * Revs in the green window at GO give a boosted launch; revs in the red spin the wheels;
 * revs below the green start normally, with the engine bogging (sound only). Each engine revs at its own pace (`engine.revTime`): a two-stroke snaps up,
 * a V8 swells slowly.
 */
export const LAUNCH = {
  /** Seconds each of 3, 2 and 1 shows. */
  beat: 0.7,
  /** The green window on the rev counter. */
  green: [0.66, 0.86] as const,
  /** Revs with the engine idling. */
  idle: 0.12,
  /** A perfect start: an extra push, as a forward acceleration in m/s², through the centre of mass so it cannot flip the vehicle. */
  perfect: { seconds: 1.2, push: 4 },
  /**
   * Too many revs: a short burst of wheelspin (the tyres keep `grip` of their grip for
   * `spinSeconds`), then a drag on the launch: a perfect start's push in reverse, so the
   * vehicle still gets away, just slower.
   */
  over: { seconds: 1.2, push: -2.2, spinSeconds: 0.35, grip: 0.45 },
  /** Below the green: a normal start, but the engine bogs (sound and rev counter only). */
  bogSeconds: 0.8,
}

export type LaunchKind = 'perfect' | 'over' | 'normal'

export function judgeLaunch(revs: number): LaunchKind {
  if (revs > LAUNCH.green[1]) return 'over'
  if (revs >= LAUNCH.green[0]) return 'perfect'
  return 'normal'
}

/** Rate (per second) that takes the revs from idle to the limiter in `revTime` seconds. */
const rate = (revTime: number) => Math.log((1.06 - LAUNCH.idle) / 0.06) / revTime

/**
 * Engine revs with their own inertia. Out of gear (the countdown) the gas pulls them towards
 * the limiter and they sink back to idle without it; in gear they follow the wheels, but no
 * faster than the engine can rev.
 */
export class EngineRevs {
  revs = LAUNCH.idle
  private limiter = 0

  constructor(private readonly revTime: number) {}

  /** Free revving, out of gear. */
  free(gas: boolean, dt: number): number {
    const k = rate(this.revTime)
    if (gas) {
      this.revs += (1.06 - this.revs) * Math.min(1, dt * k)
      // The limiter cuts in: a flicker just under the top.
      if (this.revs >= 1) this.limiter = 0.05
    } else this.revs += (LAUNCH.idle - this.revs) * Math.min(1, dt * k * 0.8)
    if (this.limiter > 0) {
      this.limiter -= dt
      this.revs = Math.min(this.revs, 0.95)
    }
    return (this.revs = Math.min(1, this.revs))
  }

  /** In gear: chase the revs the wheels set, at this engine's pace (faster on the way down). */
  follow(target: number, dt: number): number {
    const k = rate(this.revTime) * (target < this.revs ? 2.5 : 1)
    this.revs += (target - this.revs) * Math.min(1, dt * k)
    return this.revs
  }
}
