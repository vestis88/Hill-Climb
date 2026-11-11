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
  /** After the tank runs dry, the run ends once the car has stopped (or after this long). */
  outOfFuelTimeout: 6,
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
  /** Coins per second of wheelie (front wheels up, back wheels down, moving), for at least minWheelie. */
  wheelieCoinsPerSecond: 15,
  minWheelie: 1,
  /** A first-time bonus at every multiple of this distance. */
  milestoneEvery: 100,
  /** Bonus for the k-th milestone (k = 1 at 100 m). Flat, set by the economy simulation (npm run economy). */
  milestoneBonus: (_k: number) => 15,
}

export type RunStatus = 'running' | 'crashed' | 'outOfFuel'

export type RunEvent =
  | { kind: 'coin'; value: number; x: number; y: number }
  | { kind: 'fuel'; x: number; y: number }
  | { kind: 'air'; value: number; seconds: number }
  | { kind: 'flip'; value: number; flips: number; direction: 'back' | 'front' }
  | { kind: 'wheelie'; value: number; seconds: number }
  | { kind: 'milestone'; value: number; distance: number }

export interface RunOptions {
  vehicle: VehicleSpec
  height: HeightFn
  gravity?: number
  groundFriction?: number
  pickups: PickupSource
  /** Best distance so far on this track; milestones beyond it pay a bonus. */
  bestDistance: number
}

const TAU = Math.PI * 2
const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU)

/** One run: wraps the physics with fuel, coins, stunts and the end of the run. Deterministic. */
export class Run {
  readonly sim: Sim
  fuel = 1
  status: RunStatus = 'running'
  coins = { track: 0, air: 0, flips: 0, wheelies: 0, milestones: 0 }
  /** Events from the last step only, for pop-ups and sounds. */
  events: RunEvent[] = []
  /** The driver's sway while driving, and the ragdoll after a crash. */
  readonly sway = new DriverSway()
  ragdoll: Ragdoll | null = null
  /** Distance when the run ended; the car may roll on a little afterwards. */
  endDistance: number | null = null
  private airSteps = 0
  /** The car's angle relative to the ground on the last step with wheels down. */
  private lastGroundRel = 0
  private wheelieSteps = 0
  private takeoffAngle = 0
  private emptySteps = 0
  private nextMilestone: number

  constructor(readonly options: RunOptions) {
    const { vehicle, height, gravity, groundFriction } = options
    this.sim = new Sim({ vehicle, height, gravity, groundFriction })
    options.pickups.ensure(60)
    const every = RULES.milestoneEvery
    this.nextMilestone = Math.floor(options.bestDistance / every) * every + every
  }

  get totalCoins(): number {
    const c = this.coins
    return c.track + c.air + c.flips + c.wheelies + c.milestones
  }

  step(rawInput: Input): void {
    this.events = []
    if (this.status !== 'running') {
      // Keep the physics going briefly so the crash or the final roll can be seen.
      this.sim.step({ gas: false, brake: false })
      return
    }
    const input = this.fuel > 0 ? rawInput : { gas: false, brake: rawInput.brake }

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

    if (this.fuel <= 0) {
      this.emptySteps++
      const stopped = Math.abs(s.speed) < 0.3 && !s.airborne
      if ((stopped && this.emptySteps > 30) || this.emptySteps * STEP > RULES.outOfFuelTimeout) {
        this.status = 'outOfFuel'
        this.endDistance = s.distance
      }
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
        this.fuel = 1
        this.events.push({ kind: 'fuel', x: p.x, y: p.y })
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
      this.wheelieSteps++
      return
    }
    const seconds = this.wheelieSteps * STEP
    this.wheelieSteps = 0
    if (seconds >= RULES.minWheelie) {
      const value = Math.floor(seconds * RULES.wheelieCoinsPerSecond)
      this.coins.wheelies += value
      this.events.push({ kind: 'wheelie', value, seconds })
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
