import { Vec2 } from 'planck'
import { LAUNCH, judgeLaunch, type LaunchKind } from './launch'
import type { Pickup, PickupSource } from '../data/track'
import { DriverSway, Ragdoll } from './driver'
import type { HeightFn, Input, SimState, VehicleSpec } from './types'
import { Sim, STEP } from './world'

/** Run rules, from README "The run". */
export const RULES = {
  /** Seconds of fuel with the gas held. */
  fuelSecondsOnGas: 40,
  /** Seconds of fuel with no gas. */
  fuelSecondsIdle: 90,
  /**
   * After the tank runs dry the car rolls on: the run ends once it has stood still for
   * emptyStopSeconds, or made no new ground for emptyStuckSeconds (rocking in a dip).
   * Rolling into a fuel can on empty refuels and pays emptyRescueBonus (owner's rule).
   */
  emptyStopSeconds: 1,
  emptyStuckSeconds: 8,
  emptyRescueBonus: 1000,
  pickupRadius: 1.1,
  /** Coins per second in the air, for jumps of at least minAirTime. Raised after owner playtest. */
  airCoinsPerSecond: 20,
  minAirTime: 0.8,
  /** Coins for one jump with this many full flips: single, double, triple, quad (owner's values). */
  flipPayout: (flips: number) => (flips <= 0 ? 0 : flips <= 4 ? [0, 100, 300, 900, 2000][flips] : 2000 + 1500 * (flips - 4)),
  /** A landing counts when the car is within this angle of the ground (radians, about 80 degrees). */
  landingTolerance: 1.4,
  /** A flip counts from 2π minus this much rotation (radians): about 245 degrees. */
  flipTolerance: 2,
  /**
   * Coins per metre of wheelie (front wheels up, back wheels down, moving forward), for
   * wheelies of at least minWheelie metres. Distance, not time (owner): a fast wheelie pays more.
   */
  wheelieCoinsPerMetre: 2,
  minWheelie: 10,
  /** A first-time bonus at every multiple of this distance. */
  milestoneEvery: 100,
  /** Bonus for the k-th milestone (k = 1 at 100 m). Flat, set by the economy simulation (npm run economy). */
  milestoneBonus: (_k: number) => 15,
}

export type RunStatus = 'running' | 'crashed' | 'outOfFuel' | 'finished'

export type RunEvent =
  | { kind: 'coin'; value: number; x: number; y: number }
  | { kind: 'fuel'; x: number; y: number; /** Coins for reaching it on an empty tank. */ bonus: number }
  | { kind: 'air'; value: number; seconds: number }
  | { kind: 'flip'; value: number; flips: number; direction: 'back' | 'front' }
  | { kind: 'wheelie'; value: number; metres: number }
  | { kind: 'milestone'; value: number; distance: number }

export interface RunOptions {
  vehicle: VehicleSpec
  height: HeightFn
  gravity?: number
  groundFriction?: number
  pickups: PickupSource
  /** Best distance so far on this track; milestones beyond it pay a bonus. */
  bestDistance: number
  /** Race mode: the finish line, metres from the start. The run ends there and is timed. */
  finish?: number
  /** Puddles on the track. */
  puddles?: import('./types').PuddleFn
}

const TAU = Math.PI * 2
const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU)

/** One run: wraps the physics with fuel, coins, stunts and the end of the run. Deterministic. */
export class Run {
  readonly sim: Sim
  fuel = 1
  status: RunStatus = 'running'
  /** The start judged at GO, and seconds of its boost (or bog) left. */
  launchKind: LaunchKind = 'normal'
  private launchLeft = 0
  coins = { track: 0, air: 0, flips: 0, wheelies: 0, milestones: 0, rescue: 0 }
  /** Events from the last step only, for pop-ups and sounds. */
  events: RunEvent[] = []
  /** The driver's sway while driving, and the ragdoll after a crash. */
  readonly sway = new DriverSway()
  ragdoll: Ragdoll | null = null
  /** Distance when the run ended; the car may roll on a little afterwards. */
  endDistance: number | null = null
  /** Race mode: seconds from the start to the finish line, once crossed. */
  finishTime: number | null = null
  private airSteps = 0
  /** The car's angle relative to the ground on the last step with wheels down. */
  private lastGroundRel = 0
  /** Where the current wheelie started (chassis x), or null when not on the back wheel. */
  private wheelieStart: number | null = null
  private takeoffAngle = 0
  private stoppedSteps = 0
  /** Furthest point reached on an empty tank, and steps since it last moved on. */
  private emptyBestX = -Infinity
  private stuckSteps = 0
  private nextMilestone: number

  constructor(readonly options: RunOptions) {
    const { vehicle, height, gravity, groundFriction, puddles } = options
    this.sim = new Sim({ vehicle, height, gravity, groundFriction, puddles })
    options.pickups.ensure(60)
    const every = RULES.milestoneEvery
    this.nextMilestone = Math.floor(options.bestDistance / every) * every + every
  }

  get totalCoins(): number {
    const c = this.coins
    return c.track + c.air + c.flips + c.wheelies + c.milestones + c.rescue
  }

  /** GO: the revs at that moment decide the start (sim/launch.ts). */
  launch(revs: number): LaunchKind {
    this.launchKind = judgeLaunch(revs)
    this.launchLeft = this.launchKind === 'perfect' ? LAUNCH.perfect.seconds : this.launchKind === 'over' ? LAUNCH.over.seconds : 0
    return this.launchKind
  }

  step(rawInput: Input): void {
    this.events = []
    if (this.status !== 'running') {
      // Keep the physics going briefly so the crash or the final roll can be seen.
      this.sim.step({ gas: false, brake: false })
      return
    }
    // On an empty tank only the brake works: it brakes, and in the air tips the nose down.
    const input = this.fuel > 0 ? rawInput : { gas: false, brake: rawInput.brake, empty: true }

    const v = this.sim.vehicle
    v.torqueScale = 1
    v.gripScale = 1
    if (this.launchLeft > 0 && input.gas) {
      this.launchLeft -= STEP
      const effect = this.launchKind === 'perfect' ? LAUNCH.perfect : LAUNCH.over
      // The effect fades out over its last third rather than stopping dead.
      const fade = Math.max(0, Math.min(1, this.launchLeft / (effect.seconds / 3)))
      if (this.launchKind === 'over') v.gripScale = 1 + (LAUNCH.over.grip - 1) * fade
      else {
        const mass = [v.chassis, ...v.wheels].reduce((m, b) => m + b.getMass(), 0)
        const a = v.chassis.getAngle()
        v.chassis.applyForceToCenter(Vec2(Math.cos(a) * mass * LAUNCH.perfect.push * fade, Math.sin(a) * mass * LAUNCH.perfect.push * fade), true)
      }
    } else if (!input.gas) this.launchLeft = 0
    this.sim.step(input)
    this.fuel -= STEP / (input.gas ? RULES.fuelSecondsOnGas : RULES.fuelSecondsIdle)
    this.fuel = Math.max(0, this.fuel)

    const s = this.sim.state()
    this.sway.update(this.sim.vehicle.chassis, STEP)
    this.collect(s)
    if (this.headOnGround()) {
      this.status = 'crashed'
      this.endDistance = s.distance
      this.ragdoll = new Ragdoll(this.sim.world, this.sim.vehicle, this.sway.lean)
      return
    }
    this.stunts(s)
    this.milestones(s)
    if (this.options.finish !== undefined && s.distance >= this.options.finish) {
      this.status = 'finished'
      this.endDistance = this.options.finish
      this.finishTime = this.sim.steps * STEP
      return
    }

    if (this.fuel <= 0) {
      const stopped = Math.abs(s.speed) < 0.3 && !s.airborne
      this.stoppedSteps = stopped ? this.stoppedSteps + 1 : 0
      if (s.chassis.x > this.emptyBestX + 0.5) {
        this.emptyBestX = s.chassis.x
        this.stuckSteps = 0
      } else this.stuckSteps++
      if (this.stoppedSteps * STEP >= RULES.emptyStopSeconds || this.stuckSteps * STEP >= RULES.emptyStuckSeconds) {
        this.status = 'outOfFuel'
        this.endDistance = s.distance
      }
    } else {
      this.stoppedSteps = 0
      this.stuckSteps = 0
      this.emptyBestX = -Infinity
    }
  }

  headOnGround(): boolean {
    const head = this.sim.vehicle.headPosition()
    return head.y - this.options.vehicle.driver.headRadius < this.options.height(head.x)
  }

  private collect(s: SimState): void {
    const pickups = this.options.pickups.items
    this.options.pickups.ensure(s.chassis.x + 60)
    const head = this.sim.vehicle.headPosition()
    const r2 = RULES.pickupRadius * RULES.pickupRadius
    const near = (p: Pickup, q: { x: number; y: number }) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 < r2
    const points = [s.chassis, head, ...s.wheels]
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i]
      if (p.taken || p.x < s.chassis.x - 4) continue
      if (p.x > s.chassis.x + 4) break
      if (!points.some((q) => near(p, q))) continue
      p.taken = true
      if (p.kind === 'coin') {
        this.coins.track += p.value
        this.events.push({ kind: 'coin', value: p.value, x: p.x, y: p.y })
      } else {
        const bonus = this.fuel <= 0 ? RULES.emptyRescueBonus : 0
        this.coins.rescue += bonus
        this.fuel = 1
        this.events.push({ kind: 'fuel', x: p.x, y: p.y, bonus })
      }
    }
  }

  /**
   * Air time and flips. Rotation is measured relative to the ground under the car, so taking off
   * nose-up from a ramp and landing on a downslope does not eat into a flip. A jump ends when a
   * wheel touches with the car roughly upright relative to the ground; a wheel brushing the
   * ground mid-rotation (car sideways or upside down) does not end it. A head landing has
   * already ended the run before this is called.
   */
  private stunts(s: SimState): void {
    this.wheelie(s)
    const rel = s.chassis.angle - this.slopeAngle(s.chassis.x)
    if (s.airborne) {
      if (this.airSteps === 0) this.takeoffAngle = this.lastGroundRel
      this.airSteps++
      return
    }
    if (this.airSteps === 0) {
      this.lastGroundRel = rel
      return
    }
    if (Math.abs(wrapAngle(rel)) > RULES.landingTolerance) {
      // Touching, but not upright: a brush mid-rotation. Keep counting the jump.
      this.airSteps++
      return
    }
    const seconds = this.airSteps * STEP
    const signedTurn = rel - this.takeoffAngle
    const turned = Math.abs(signedTurn)
    this.airSteps = 0
    this.lastGroundRel = rel
    if (seconds >= RULES.minAirTime) {
      const value = Math.floor(seconds * RULES.airCoinsPerSecond)
      this.coins.air += value
      this.events.push({ kind: 'air', value, seconds })
    }
    // Upright at both ends, so a real flip turns close to a whole number of turns; anything
    // from about 245 degrees per turn counts, which no non-flip landing can reach.
    const flips = Math.floor((turned + RULES.flipTolerance) / TAU)
    if (flips > 0) {
      const value = RULES.flipPayout(flips)
      this.coins.flips += value
      // Nose-up rotation (counter-clockwise, the car faces right) is a backflip.
      this.events.push({ kind: 'flip', value, flips, direction: signedTurn > 0 ? 'back' : 'front' })
    }
  }

  /** Angle of the ground at x, radians (positive uphill). */
  private slopeAngle(x: number): number {
    const h = this.options.height
    return Math.atan2(h(x + 0.5) - h(x - 0.5), 1)
  }

  /** Front wheels up, back wheels on the ground, moving forward: a wheelie. Paid when it ends. */
  private wheelie(s: SimState): void {
    const wheels = this.options.vehicle.wheels
    const front = wheels.map((w, i) => (w.axle === 'front' ? s.wheelContacts[i] : null)).filter((c) => c !== null)
    const rear = wheels.map((w, i) => (w.axle === 'rear' ? s.wheelContacts[i] : null)).filter((c) => c !== null)
    const on = front.length > 0 && front.every((c) => !c) && rear.some((c) => c) && s.speed > 1.5
    if (on) {
      this.wheelieStart ??= s.chassis.x
      return
    }
    if (this.wheelieStart === null) return
    const metres = s.chassis.x - this.wheelieStart
    this.wheelieStart = null
    if (metres >= RULES.minWheelie) {
      const value = Math.floor(metres * RULES.wheelieCoinsPerMetre)
      this.coins.wheelies += value
      this.events.push({ kind: 'wheelie', value, metres })
    }
  }

  private milestones(s: SimState): void {
    while (s.distance >= this.nextMilestone) {
      const k = Math.round(this.nextMilestone / RULES.milestoneEvery)
      const value = RULES.milestoneBonus(k)
      this.coins.milestones += value
      this.events.push({ kind: 'milestone', value, distance: this.nextMilestone })
      this.nextMilestone += RULES.milestoneEvery
    }
  }
}
