import { Box, Chain, Edge, Polygon, RevoluteJoint, Vec2, World, type Body, type Fixture } from 'planck'
import { padPolygon, type LevelGeom, type Pad } from './level'
import type { StuntObstacle } from './stunt'
import { TerrainStreamer, TERRAIN_FRICTION } from './terrain'
import type { HeightFn, Input, PuddleFn, SimState, VehicleSpec } from './types'
import { Vehicle } from './vehicle'

/** Fixed simulation step. Rendering interpolates; physics never uses real time. */
export const STEP = 1 / 60

/** Ice's friction: the tyre's and the ground's are mixed as a square root, so this gives about 0.01. */
const ICE = 0.00008

/** Seconds after a crumbling plank starts to fall that it breaks up and is gone. */
const CRUMBLE_GONE = 1.4

/** Ground is kept this far behind and ahead of the car, metres. */
const BEHIND = 80
const AHEAD = 140

export interface SimOptions {
  vehicle: VehicleSpec
  height: HeightFn
  gravity?: number
  /** Vehicle start position. y defaults to resting just above the ground. */
  start?: { x: number; y?: number }
  /** Friction of the ground surface. */
  groundFriction?: number
  /** Puddles on the track (water, mud, slush). */
  puddles?: PuddleFn
  /** Track pieces built as bodies (Stuntbanan's loops and seesaws) between two distances. */
  obstacles?: (from: number, to: number) => StuntObstacle[]
  /**
   * A Klurbana (sim/level.ts): solid polygons instead of ground from `height`, built once.
   * `start.y` is then the ground under the start; the vehicle is placed just above it.
   */
  level?: LevelGeom
}

/**
 * A loop's state: 0 coming in and 1 climbing the right side (the right side is solid), 2 over the
 * top and coming down the left side (the left side is solid), 3 done (nothing solid: drive out).
 */
interface LoopState {
  o: Extract<StuntObstacle, { kind: 'loop' }>
  body: Body
  phase: 0 | 1 | 2 | 3
}

/** Deterministic game simulation. No DOM, no clock, no Math.random. */
export class Sim {
  readonly world: World
  readonly vehicle: Vehicle
  readonly terrain: TerrainStreamer
  private readonly startX: number
  private maxX: number
  steps = 0
  /** Loops driven all the way round (Run pays for each). */
  loopsDone = 0
  private loops = new Map<string, LoopState>()
  private seesaws = new Map<string, { o: Extract<StuntObstacle, { kind: 'seesaw' }>; pivot: Body; plank: Body }>()
  /**
   * The chassis and wheel angles as continuous values. planck wraps a body's angle into
   * -180..180 degrees whenever its position is set directly (the bike's bump stops do that on
   * hard landings), which would erase full turns and lose flips. Each step, any jump of more
   * than half a turn is taken back out, so turns keep adding up.
   */
  private angleOffsets: number[] = []
  /** Klurbanor's doors (null once opened) and crumbling planks (with the step a wheel first touched each). */
  private doors: (Body | null)[] = []
  private crumbles: { body: Body | null; touched: number | null; falling: number | null }[] = []
  private lastRaw: number[] = []

  constructor(readonly options: SimOptions) {
    this.world = new World({ gravity: new Vec2(0, -(options.gravity ?? 10)) })
    this.terrain = new TerrainStreamer(this.world, options.height, options.groundFriction ?? TERRAIN_FRICTION)
    const startX = options.start?.x ?? 0
    const ground = this.terrain.body
    if (options.level) {
      // Every solid of the level as a closed chain on the ground body (wheels and grip treat
      // it as ground).
      for (const poly of options.level.polygons) {
        ground.createFixture(new Chain(poly.map(([px, py]) => new Vec2(px, py)), true), { friction: options.groundFriction ?? TERRAIN_FRICTION })
      }
      for (const poly of options.level.ice ?? []) {
        ground.createFixture(new Chain(poly.map(([px, py]) => new Vec2(px, py)), true), { friction: ICE })
      }
      for (const pad of options.level.pads ?? []) {
        ground.createFixture(new Polygon(padPolygon(pad).map(([px, py]) => new Vec2(px, py))), { friction: pad.kind === 'ice' ? ICE : (options.groundFriction ?? TERRAIN_FRICTION), userData: { pad } })
      }
      for (const d of options.level.doors ?? []) {
        const body = this.world.createBody({ userData: { track: true } })
        body.createFixture(new Chain(d.poly.map(([px, py]) => new Vec2(px, py)), true), { friction: options.groundFriction ?? TERRAIN_FRICTION })
        this.doors.push(body)
      }
      for (const c of options.level.crumbles ?? []) {
        const body = this.world.createBody({ position: new Vec2((c.x0 + c.x1) / 2, c.y - 0.225), userData: { track: true } })
        body.createFixture(new Box((c.x1 - c.x0) / 2, 0.225), { density: 3, friction: options.groundFriction ?? TERRAIN_FRICTION })
        this.crumbles.push({ body, touched: null, falling: null })
      }
    } else this.terrain.ensure(startX - BEHIND, startX + AHEAD)

    const x = options.start?.x ?? 0
    const lowestWheel = Math.min(...options.vehicle.wheels.map((w) => w.anchor.y - w.radius))
    const y = options.level ? (options.start?.y ?? 0) - lowestWheel + 0.05 : (options.start?.y ?? options.height(x) - lowestWheel + 0.05)
    this.vehicle = new Vehicle(this.world, options.vehicle, ground, { x, y })
    this.startX = x
    this.maxX = x

    // Grip per wheel contact: puddles cost grip; the Marsh Rover's studs keep a minimum; a
    // start with too many revs spins the wheels (vehicle.gripScale).
    const { puddles } = options
    const amphibious = options.vehicle.amphibious
    // Loops: only the part of the ring the car should be on is solid (see updateObstacles).
    if (options.obstacles) {
      this.world.on('pre-solve', (contact) => {
        const solid = this.loopSolid(contact.getFixtureA()) ?? this.loopSolid(contact.getFixtureB())
        if (solid === false) contact.setEnabled(false)
      })
    }
    {
      const wheels = new Set(this.vehicle.wheels)
      this.world.on('pre-solve', (contact) => {
        const a = contact.getFixtureA().getBody()
        const b = contact.getFixtureB().getBody()
        const wheel = wheels.has(a) ? a : wheels.has(b) ? b : null
        if (!wheel || (a !== ground && b !== ground)) return
        // Start from the tyre and ground's own friction every step: the contact keeps the value
        // set last step, so scaling that would compound towards zero grip.
        let f = Math.sqrt(contact.getFixtureA().getFriction() * contact.getFixtureB().getFriction())
        // Studs bite only on slippery ground (snow, ice, mud, sand); on grass and rock the
        // soft balloon tyres are all it has.
        if (amphibious && (options.groundFriction ?? TERRAIN_FRICTION) < 0.7) f = Math.max(f, amphibious.minGrip)
        else {
          const p = puddles?.(wheel.getPosition().x)
          if (p) f *= p.grip
        }
        contact.setFriction(f * this.vehicle.gripScale)
      })
    }
  }

  /** Puddles drag the vehicle back in proportion to speed and to how many wheels are in. */
  private puddleDrag(): void {
    const { puddles, vehicle: spec } = this.options
    if (!puddles || spec.amphibious) return
    const contacts = this.vehicle.wheelContacts()
    let drag = 0
    this.vehicle.wheels.forEach((w, i) => {
      const p = contacts[i] ? puddles(w.getPosition().x) : null
      if (p) drag += p.drag / this.vehicle.wheels.length
    })
    if (drag === 0) return
    const bodies = [this.vehicle.chassis, ...this.vehicle.wheels]
    for (const body of bodies) {
      const v = body.getLinearVelocity()
      body.applyForceToCenter(new Vec2(-v.x * drag * body.getMass(), 0), true)
    }
  }

  /** The puddle under a wheel touching the ground, for splashes (renderer). */
  puddleUnder(wheel: number): ReturnType<PuddleFn> {
    if (!this.options.puddles || !this.vehicle.wheelContacts()[wheel]) return null
    return this.options.puddles(this.vehicle.wheels[wheel].getPosition().x)
  }

  step(input: Input): void {
    const x = this.vehicle.chassis.getPosition().x
    if (!this.options.level) this.terrain.ensure(x - BEHIND, x + AHEAD)
    if (this.options.obstacles) this.updateObstacles(x)
    this.vehicle.applyInput(input)
    this.puddleDrag()
    this.world.step(STEP, 8, 3)
    if (this.options.level) this.levelPieces()
    this.vehicle.limitTravel()
    this.unwrapAngles()
    this.steps++
    this.maxX = Math.max(this.maxX, this.vehicle.chassis.getPosition().x)
  }

  /**
   * Stuntbanan's track pieces near the car: loops (a ring of edges, only part of which is solid
   * at a time so the car can drive in at the bottom and out again) and seesaws (a plank on a
   * pivot). Built ahead of the car and removed behind it.
   */
  private updateObstacles(x: number): void {
    const wanted = this.options.obstacles!(x - 50, x + 110)
    for (const o of wanted) {
      if (o.kind === 'loop' && !this.loops.has(o.id)) this.loops.set(o.id, { o, body: this.buildLoop(o), phase: 0 })
      if (o.kind === 'seesaw' && !this.seesaws.has(o.id)) this.seesaws.set(o.id, { o, ...this.buildSeesaw(o) })
    }
    for (const [id, l] of this.loops) {
      if (Math.abs(l.o.cx - x) > 160) {
        this.world.destroyBody(l.body)
        this.loops.delete(id)
        continue
      }
      // Where the car is around the loop decides which part of the ring is solid.
      const p = this.vehicle.chassis.getPosition()
      const dx = p.x - l.o.cx
      const dy = p.y - l.o.cy
      const a = (Math.atan2(dy, dx) * 180) / Math.PI
      const dist = Math.hypot(dx, dy)
      const inside = dist < l.o.r + 1.5
      // Over the top and down the far side only count close to the ring: falling off at the top
      // and dropping through the middle is not a loop.
      const onRing = inside && dist > l.o.r - 1.8
      if (dx < -l.o.r - 3) l.phase = 0
      else if (l.phase === 0 && inside && a > -50 && a < 60) l.phase = 1
      else if (l.phase === 1 && onRing && (a > 100 || a < -150)) l.phase = 2
      else if (l.phase === 2 && dist < l.o.r - 1.8 && a > 30 && a < 150) l.phase = 1
      else if (l.phase === 2 && onRing && a > -125 && a < -55) {
        l.phase = 3
        this.loopsDone++
      }
    }
    for (const [id, s] of this.seesaws) {
      if (Math.abs(s.o.x - x) > 160) {
        this.world.destroyBody(s.plank)
        this.world.destroyBody(s.pivot)
        this.seesaws.delete(id)
      }
    }
  }

  /**
   * Klurbanor's pieces after each step: trampolines and boost strips act on the vehicle, and
   * crumbling planks start their countdown when first touched and fall when it runs out.
   */
  private levelPieces(): void {
    const bodies = [this.vehicle.chassis, ...this.vehicle.wheels]
    let bounce = 0
    let boost = 0
    for (const b of bodies) {
      for (let e = b.getContactList(); e; e = e.next ?? null) {
        if (!e.contact.isTouching()) continue
        const f = e.contact.getFixtureA().getBody() === b ? e.contact.getFixtureB() : e.contact.getFixtureA()
        const pad = (f.getUserData() as { pad?: Pad } | null)?.pad
        if (pad?.kind === 'bounce') bounce = Math.max(bounce, pad.power ?? 12)
        if (pad?.kind === 'boost' && b !== this.vehicle.chassis) boost = pad.power ?? 18
        const i = this.crumbles.findIndex((c) => c.body !== null && c.body === f.getBody())
        if (i >= 0 && this.crumbles[i].touched === null) this.crumbles[i].touched = this.steps
      }
    }
    if (bounce > 0) {
      for (const b of bodies) {
        const v = b.getLinearVelocity()
        if (v.y < bounce) b.setLinearVelocity(new Vec2(v.x, bounce))
      }
    }
    if (boost !== 0) {
      const dir = Math.sign(boost)
      if (this.vehicle.chassis.getLinearVelocity().x * dir < Math.abs(boost)) {
        for (const b of bodies) b.applyForceToCenter(new Vec2(dir * 30 * b.getMass(), 0), true)
      }
    }
    this.options.level!.crumbles?.forEach((c, i) => {
      const s = this.crumbles[i]
      if (!s.body) return
      if (s.falling === null && s.touched !== null && (this.steps - s.touched) * STEP >= c.delay) {
        s.falling = this.steps
        s.body.setDynamic()
        s.body.setAwake(true)
      }
      // A fallen plank breaks up after a while (so it never lies in the way on a floor below).
      if (s.falling !== null && (this.steps - s.falling) * STEP >= CRUMBLE_GONE) {
        this.world.destroyBody(s.body)
        s.body = null
      }
    })
  }

  /** Open a door (its key gem was taken). */
  openDoor(i: number): void {
    const d = this.doors[i]
    if (!d) return
    this.world.destroyBody(d)
    this.doors[i] = null
  }

  /** Which doors are still shut, and where each crumbling plank is now (renderer, head checks). */
  pieces(): { doors: boolean[]; crumbles: ({ x: number; y: number; angle: number; touched: boolean } | null)[] } {
    return {
      doors: this.doors.map((d) => d !== null),
      crumbles: this.crumbles.map((c) => {
        if (!c.body) return null
        const p = c.body.getPosition()
        return { x: p.x, y: p.y, angle: c.body.getAngle(), touched: c.touched !== null }
      }),
    }
  }

  private buildLoop(o: Extract<StuntObstacle, { kind: 'loop' }>): Body {
    const body = this.world.createBody({ userData: { track: true } })
    for (let a = -180; a < 180; a += 10) {
      const mid = a + 5
      const p = (deg: number) => new Vec2(o.cx + Math.cos((deg * Math.PI) / 180) * o.r, o.cy + Math.sin((deg * Math.PI) / 180) * o.r)
      body.createFixture(new Edge(p(a), p(a + 10)), { friction: 0.9, userData: { loop: o.id, mid } })
    }
    return body
  }

  private buildSeesaw(o: Extract<StuntObstacle, { kind: 'seesaw' }>): { pivot: Body; plank: Body } {
    const pivot = this.world.createBody({ position: new Vec2(o.x, o.y) })
    // Joined while level, so its limits are ±0.3 from level; then tipped onto its near end.
    const plank = this.world.createBody({ type: 'dynamic', position: new Vec2(o.x, o.y), userData: { track: true } })
    plank.createFixture(new Box(o.length / 2, 0.13), { density: o.density ?? 2.2, friction: 0.9 })
    this.world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -0.3, upperAngle: 0.3 }, pivot, plank, new Vec2(o.x, o.y)))
    plank.setAngle(0.28)
    return { pivot, plank }
  }

  /** Whether a loop's edge is solid right now (pre-solve asks for each contact). */
  private loopSolid(f: Fixture): boolean | null {
    const d = f.getUserData() as { loop?: string; mid?: number } | null
    if (!d?.loop) return null
    const l = this.loops.get(d.loop)
    if (!l) return false
    const m = d.mid!
    // In: from the bottom (flush with the ground) up the right side and over the top.
    if (l.phase <= 1) return m >= -90 && m <= 115
    // Down the left side and round the bottom.
    if (l.phase === 2) return m >= 65 || m <= -90
    return false
  }

  /** True while the car is on its way round a loop (Hjälp's anti-tip hand stays off then). */
  get inLoop(): boolean {
    for (const l of this.loops.values()) if (l.phase === 1 || l.phase === 2) return true
    return false
  }

  /** Each seesaw's plank angle, for drawing (the renderer knows where they are from sim/stunt.ts). */
  seesawAngles(): Map<string, number> {
    return new Map([...this.seesaws].map(([id, s]) => [id, s.plank.getAngle()]))
  }

  private unwrapAngles(): void {
    const bodies = [this.vehicle.chassis, ...this.vehicle.wheels]
    bodies.forEach((b, i) => {
      const raw = b.getAngle()
      const last = this.lastRaw[i] ?? raw
      const diff = raw - last
      // Real rotation in one 1/60 s step is far below half a turn; a bigger jump is a wrap.
      if (Math.abs(diff) > Math.PI) this.angleOffsets[i] = (this.angleOffsets[i] ?? 0) - 2 * Math.PI * Math.round(diff / (2 * Math.PI))
      this.lastRaw[i] = raw
    })
  }

  /** A body's angle with full turns kept (see angleOffsets). */
  private angleOf(i: number): number {
    const b = i === 0 ? this.vehicle.chassis : this.vehicle.wheels[i - 1]
    return b.getAngle() + (this.angleOffsets[i] ?? 0)
  }

  state(): SimState {
    const { chassis, wheels } = this.vehicle
    const p = chassis.getPosition()
    const contacts = this.vehicle.wheelContacts()
    return {
      chassis: { x: p.x, y: p.y, angle: this.angleOf(0) },
      wheels: wheels.map((w, i) => ({ x: w.getPosition().x, y: w.getPosition().y, angle: this.angleOf(i + 1) })),
      speed: chassis.getLinearVelocity().x,
      rpm: this.vehicle.rpm(),
      distance: this.maxX - this.startX,
      airborne: !contacts.some(Boolean),
      wheelContacts: contacts,
      gear: this.vehicle.gear,
      revs: this.vehicle.revs(),
      shifting: this.vehicle.shifting,
    }
  }
}
