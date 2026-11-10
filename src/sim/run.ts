import type { Pickup } from '../data/track'
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
  /** Coins per second in the air, for jumps of at least one second. */
  airCoinsPerSecond: 10,
  minAirTime: 1,
  coinsPerFlip: 50,
  /** A first-time bonus at every multiple of this distance. */
  milestoneEvery: 100,
  /** Bonus for the k-th milestone (k = 1 at 100 m). */
  milestoneBonus: (k: number) => 25 * k,
}

export type RunStatus = 'running' | 'crashed' | 'outOfFuel'

export type RunEvent =
  | { kind: 'coin'; value: number; x: number; y: number }
  | { kind: 'fuel'; x: number; y: number }
  | { kind: 'air'; value: number; seconds: number }
  | { kind: 'flip'; value: number; flips: number }
  | { kind: 'milestone'; value: number; distance: number }

export interface RunOptions {
  vehicle: VehicleSpec
  height: HeightFn
  pickups: Pickup[]
  /** Best distance so far on this track; milestones beyond it pay a bonus. */
  bestDistance: number
}

const TAU = Math.PI * 2
const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU)

/** One run: wraps the physics with fuel, coins, stunts and the end of the run. Deterministic. */
export class Run {
  readonly sim: Sim
  readonly taken: boolean[]
  fuel = 1
  status: RunStatus = 'running'
  coins = { track: 0, air: 0, flips: 0, milestones: 0 }
  /** Events from the last step only, for pop-ups and sounds. */
  events: RunEvent[] = []
  private airSteps = 0
  private takeoffAngle = 0
  private emptySteps = 0
  private nextMilestone: number

  constructor(readonly options: RunOptions) {
    this.sim = new Sim({ vehicle: options.vehicle, height: options.height })
    this.taken = options.pickups.map(() => false)
    const every = RULES.milestoneEvery
    this.nextMilestone = Math.floor(options.bestDistance / every) * every + every
  }

  get totalCoins(): number {
    const c = this.coins
    return c.track + c.air + c.flips + c.milestones
  }

  step(rawInput: Input): void {
    this.events = []
    if (this.status !== 'running') return
    const input = this.fuel > 0 ? rawInput : { gas: false, brake: rawInput.brake }

    this.sim.step(input)
    this.fuel -= STEP / (input.gas ? RULES.fuelSecondsOnGas : RULES.fuelSecondsIdle)
    this.fuel = Math.max(0, this.fuel)

    const s = this.sim.state()
    this.collect(s)
    if (this.headOnGround()) {
      this.status = 'crashed'
      return
    }
    this.stunts(s)
    this.milestones(s)

    if (this.fuel <= 0) {
      this.emptySteps++
      const stopped = Math.abs(s.speed) < 0.3 && !s.airborne
      if ((stopped && this.emptySteps > 30) || this.emptySteps * STEP > RULES.outOfFuelTimeout) this.status = 'outOfFuel'
    }
  }

  headOnGround(): boolean {
    const head = this.sim.vehicle.headPosition()
    return head.y - this.options.vehicle.driver.headRadius < this.options.height(head.x)
  }

  private collect(s: SimState): void {
    const { pickups } = this.options
    const head = this.sim.vehicle.headPosition()
    const r2 = RULES.pickupRadius * RULES.pickupRadius
    const near = (p: Pickup, q: { x: number; y: number }) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 < r2
    const points = [s.chassis, head, ...s.wheels]
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i]
      if (this.taken[i] || p.x < s.chassis.x - 4) continue
      if (p.x > s.chassis.x + 4) break
      if (!points.some((q) => near(p, q))) continue
      this.taken[i] = true
      if (p.kind === 'coin') {
        this.coins.track += p.value
        this.events.push({ kind: 'coin', value: p.value, x: p.x, y: p.y })
      } else {
        this.fuel = 1
        this.events.push({ kind: 'fuel', x: p.x, y: p.y })
      }
    }
  }

  private stunts(s: SimState): void {
    if (s.airborne) {
      if (this.airSteps === 0) this.takeoffAngle = s.chassis.angle
      this.airSteps++
      return
    }
    if (this.airSteps === 0) return
    // Landed on the wheels (a head landing has already ended the run).
    const seconds = this.airSteps * STEP
    const turned = Math.abs(s.chassis.angle - this.takeoffAngle)
    this.airSteps = 0
    if (seconds >= RULES.minAirTime) {
      const value = Math.floor(seconds * RULES.airCoinsPerSecond)
      this.coins.air += value
      this.events.push({ kind: 'air', value, seconds })
    }
    const flips = Math.floor((turned + 0.8) / TAU)
    if (flips > 0 && Math.abs(wrapAngle(s.chassis.angle)) < 1.2) {
      const value = flips * RULES.coinsPerFlip
      this.coins.flips += value
      this.events.push({ kind: 'flip', value, flips })
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
