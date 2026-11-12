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
   * Coins per metre of wheelie, for wheelies of at least minWheelie metres. A wheelie lasts until
   * a front wheel touches the ground (hops on the back wheel keep it going), but only metres
   * driven forward with a back wheel on the ground count. Distance, not time (owner).
   */
  wheelieCoinsPerMetre: 2,
  /** Combos: seconds on the ground (not on the back wheel) before a chain ends and pays. */
  comboGap: 2.5,
  /** Hjälp: fuel lasts this many times longer; tipping past this angle to the ground is gently resisted. */
  assistFuel: 1.6,
  assistTilt: 0.75,
  /** Turbo canister: seconds of extra push forward while the gas is held, and how strong (m/s²). */
  turboSeconds: 3,
  turboPush: 4.5,
  /** Combo multiplier for n tricks in a chain: ×1.5 for two, +0.5 per trick, up to ×4. */
  comboMultiplier: (tricks: number) => Math.min(4, 1 + 0.5 * (tricks - 1)),
  /** A landing within this angle of the ground (radians, about 40 degrees) keeps a combo going. */
  cleanLanding: 0.7,
  minWheelie: 10,
  /**
   * Long wheelies pay more: each metre is paid at the multiplier for how far the wheelie has
   * gone so far (×2 from 25 m, ×3 from 50 m, ×4 from 100 m, ×5 from 200 m).
   */
  wheelieMultiplier: (metres: number) => (metres < 25 ? 1 : metres < 50 ? 2 : metres < 100 ? 3 : metres < 200 ? 4 : 5),
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
  | { kind: 'wheelie'; value: number; metres: number; multiplier: number }
  | { kind: 'combo'; value: number; tricks: number; multiplier: number }
  | { kind: 'comboLost'; tricks: number }
  | { kind: 'turbo'; x: number; y: number }
  | { kind: 'star'; id: string; x: number; y: number }
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
  /**
   * Hjälp, for a young player: fuel lasts longer, too many revs at the start does not bog, and on
   * the ground a gentle hand keeps the vehicle from tipping over backwards (or onto its nose).
   */
  assist?: boolean
  /** Hidden stars not yet found on this map (game/stars.ts). */
  stars?: { id: string; x: number; y: number }[]
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
  coins = { track: 0, air: 0, flips: 0, wheelies: 0, milestones: 0, rescue: 0, combos: 0 }
  /** Stars found in this run (their ids). */
  starsFound: string[] = []
  /**
   * The trick chain in progress (read by the HUD): tricks so far and their coins. Tricks done one
   * after another, each within a few seconds of the last on the ground, build a combo; when the
   * chain ends it pays a bonus on top of the tricks. A messy landing or a crash loses it.
   */
  combo: { tricks: number; coins: number } | null = null
  /** Thruster tank, seconds left (vehicles with thrusters); read by the HUD. */
  thrustLeft = 0
  /** Seconds of turbo left (from a turbo canister); read by the HUD. */
  turboLeft = 0
  /** What this run did, for missions (game/missions.ts). */
  stats = { backflips: 0, frontflips: 0, airSeconds: 0, longestWheelie: 0, maxCombo: 0 }
  private comboGround = 0
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
  /**
   * The wheelie in progress, or null: metres counted (back wheel down) and coins earned so far.
   * Read by the HUD.
   */
  wheelieNow: { metres: number; coins: number; multiplier: number } | null = null
  private wheelieLastX = 0
  private takeoffAngle = 0
  private stoppedSteps = 0
  /** Furthest point reached on an empty tank, and steps since it last moved on. */
  private emptyBestX = -Infinity
  private stuckSteps = 0
  private nextMilestone: number

  constructor(readonly options: RunOptions) {
    this.thrustLeft = options.vehicle.thrusters?.seconds ?? 0
    const { vehicle, height, gravity, groundFriction, puddles } = options
    this.sim = new Sim({ vehicle, height, gravity, groundFriction, puddles })
    options.pickups.ensure(60)
    const every = RULES.milestoneEvery
    this.nextMilestone = Math.floor(options.bestDistance / every) * every + every
  }

  get totalCoins(): number {
    const c = this.coins
    return c.track + c.air + c.flips + c.wheelies + c.milestones + c.rescue + c.combos
  }

  /** GO: the revs at that moment decide the start (sim/launch.ts). */
  launch(revs: number): LaunchKind {
    this.launchKind = judgeLaunch(revs)
    // Hjälp: too many revs just gives a normal start.
    if (this.options.assist && this.launchKind === 'over') this.launchKind = 'normal'
    this.launchLeft = this.launchKind === 'perfect' ? LAUNCH.perfect.seconds : this.launchKind === 'over' ? LAUNCH.over.seconds : 0
    return this.launchKind
  }

  step(rawInput: Input): void {
    this.events = []
    if (this.status !== 'running') {
      // The run is over: a crash loses a combo in progress, any other end pays it.
      if (this.combo && this.status === 'crashed') {
        this.events.push({ kind: 'comboLost', tricks: this.combo.tricks })
        this.combo = null
      } else if (this.combo) this.endCombo()
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
      // Too many revs: the wheels spin for as long as the launch is held back, gripping again as it fades.
      if (this.launchKind === 'over') v.gripScale = 1 + (LAUNCH.over.grip - 1) * fade
      // A perfect start pushes forward; too many revs drags back (never so much it stops).
      const mass = [v.chassis, ...v.wheels].reduce((m, b) => m + b.getMass(), 0)
      const a = v.chassis.getAngle()
      const push = effect.push * fade
      v.chassis.applyForceToCenter(Vec2(Math.cos(a) * mass * push, Math.sin(a) * mass * push), true)
    } else if (!input.gas) this.launchLeft = 0
    // Thrusters: push along the chassis's up direction while boosting, from a tank that refills
    // on the ground. They burn no fuel; with an empty tank (no fuel) they still work.
    const th = this.options.vehicle.thrusters
    if (th) {
      if (rawInput.boost && this.thrustLeft > 0) {
        this.thrustLeft = Math.max(0, this.thrustLeft - STEP)
        const mass = [v.chassis, ...v.wheels].reduce((m, b) => m + b.getMass(), 0)
        const a = v.chassis.getAngle()
        v.chassis.applyForceToCenter(Vec2(-Math.sin(a) * mass * th.push, Math.cos(a) * mass * th.push), true)
      } else if (this.sim.vehicle.wheelContacts().some(Boolean)) this.thrustLeft = Math.min(th.seconds, this.thrustLeft + STEP * th.refill)
    }
    // Hjälp: on the ground, a torque against tipping too far from the slope, growing with the tilt.
    if (this.options.assist && this.sim.vehicle.wheelContacts().some(Boolean)) {
      const x = v.chassis.getPosition().x
      const tilt = wrapAngle(v.chassis.getAngle() - this.slopeAngle(x))
      const over = Math.abs(tilt) - RULES.assistTilt
      if (over > 0) v.chassis.applyTorque(-Math.sign(tilt) * over * v.chassis.getMass() * 40, true)
    }
    // Turbo: a push along the vehicle while the gas is held, through the centre of mass.
    if (this.turboLeft > 0) {
      this.turboLeft = Math.max(0, this.turboLeft - STEP)
      if (input.gas) {
        const mass = [v.chassis, ...v.wheels].reduce((m, b) => m + b.getMass(), 0)
        const a = v.chassis.getAngle()
        v.chassis.applyForceToCenter(Vec2(Math.cos(a) * mass * RULES.turboPush, Math.sin(a) * mass * RULES.turboPush), true)
      }
    }
    this.sim.step(input)
    this.fuel -= (STEP / (input.gas ? RULES.fuelSecondsOnGas : RULES.fuelSecondsIdle)) * (this.options.vehicle.fuelUse ?? 1) / (this.options.assist ? RULES.assistFuel : 1)
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
    this.comboClock(s)
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
    // Hidden stars: a little easier to touch than a coin.
    for (const st of this.options.stars ?? []) {
      if (this.starsFound.includes(st.id) || Math.abs(st.x - s.chassis.x) > 5) continue
      if (points.some((q) => (st.x - q.x) ** 2 + (st.y - q.y) ** 2 < 1.6 * 1.6)) {
        this.starsFound.push(st.id)
        this.events.push({ kind: 'star', id: st.id, x: st.x, y: st.y })
      }
    }
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i]
      if (p.taken || p.x < s.chassis.x - 4) continue
      if (p.x > s.chassis.x + 4) break
      if (!points.some((q) => near(p, q))) continue
      p.taken = true
      if (p.kind === 'coin') {
        this.coins.track += p.value
        this.events.push({ kind: 'coin', value: p.value, x: p.x, y: p.y })
      } else if (p.kind === 'turbo') {
        this.turboLeft = RULES.turboSeconds
        this.events.push({ kind: 'turbo', x: p.x, y: p.y })
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
    // A messy landing (well off level with the ground) loses a combo in progress.
    if (Math.abs(wrapAngle(rel)) > RULES.cleanLanding && this.combo) {
      this.events.push({ kind: 'comboLost', tricks: this.combo.tricks })
      this.combo = null
    }
    const signedTurn = rel - this.takeoffAngle
    const turned = Math.abs(signedTurn)
    this.airSteps = 0
    this.lastGroundRel = rel
    if (seconds >= RULES.minAirTime) {
      const value = Math.floor(seconds * RULES.airCoinsPerSecond)
      this.coins.air += value
      this.events.push({ kind: 'air', value, seconds })
      this.stats.airSeconds += seconds
      this.addTrick(value)
    }
    // Upright at both ends, so a real flip turns close to a whole number of turns; anything
    // from about 245 degrees per turn counts, which no non-flip landing can reach.
    const flips = Math.floor((turned + RULES.flipTolerance) / TAU)
    if (flips > 0) {
      const value = RULES.flipPayout(flips)
      this.coins.flips += value
      // Nose-up rotation (counter-clockwise, the car faces right) is a backflip.
      this.events.push({ kind: 'flip', value, flips, direction: signedTurn > 0 ? 'back' : 'front' })
      if (signedTurn > 0) this.stats.backflips += flips
      else this.stats.frontflips += flips
      this.addTrick(value)
    }
  }

  private addTrick(value: number): void {
    this.combo ??= { tricks: 0, coins: 0 }
    this.combo.tricks++
    this.combo.coins += value
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo.tricks)
    this.comboGround = 0
  }

  /** Time on the ground ends a combo: two or more tricks pay their bonus. */
  private comboClock(s: SimState): void {
    if (!this.combo) return
    if (s.airborne || this.wheelieNow) {
      this.comboGround = 0
      return
    }
    this.comboGround += STEP
    if (this.comboGround >= RULES.comboGap) this.endCombo()
  }

  /** Pay a combo of two or more tricks (also called when the run ends). */
  endCombo(): void {
    const c = this.combo
    this.combo = null
    if (!c || c.tricks < 2) return
    const multiplier = RULES.comboMultiplier(c.tricks)
    const value = Math.floor(c.coins * (multiplier - 1))
    this.coins.combos += value
    this.events.push({ kind: 'combo', value, tricks: c.tricks, multiplier })
  }

  /** Angle of the ground at x, radians (positive uphill). */
  private slopeAngle(x: number): number {
    const h = this.options.height
    return Math.atan2(h(x + 0.5) - h(x - 0.5), 1)
  }

  /**
   * A wheelie starts with the front wheels up and a back wheel down, moving forward, and lasts
   * until a front wheel touches the ground. Only forward metres with a back wheel down count, at
   * a multiplier that grows with the length. Paid when it ends.
   */
  private wheelie(s: SimState): void {
    const wheels = this.options.vehicle.wheels
    const front = wheels.map((w, i) => (w.axle === 'front' ? s.wheelContacts[i] : null)).filter((c) => c !== null)
    const rear = wheels.map((w, i) => (w.axle === 'rear' ? s.wheelContacts[i] : null)).filter((c) => c !== null)
    const frontDown = front.length === 0 || front.some((c) => c)
    const rearDown = rear.some((c) => c)
    const w = this.wheelieNow
    if (!w) {
      if (!frontDown && rearDown && s.speed > 1.5) {
        this.wheelieNow = { metres: 0, coins: 0, multiplier: 1 }
        this.wheelieLastX = s.chassis.x
      }
      return
    }
    if (!frontDown) {
      const dx = s.chassis.x - this.wheelieLastX
      this.wheelieLastX = s.chassis.x
      if (rearDown && dx > 0) {
        w.multiplier = RULES.wheelieMultiplier(w.metres)
        w.metres += dx
        w.coins += dx * RULES.wheelieCoinsPerMetre * w.multiplier
      }
      return
    }
    this.wheelieNow = null
    if (w.metres >= RULES.minWheelie) {
      const value = Math.floor(w.coins)
      this.coins.wheelies += value
      this.events.push({ kind: 'wheelie', value, metres: w.metres, multiplier: w.multiplier })
      this.stats.longestWheelie = Math.max(this.stats.longestWheelie, w.metres)
      this.addTrick(value)
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
