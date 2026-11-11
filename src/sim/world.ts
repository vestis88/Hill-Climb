import { Vec2, World } from 'planck'
import { TerrainStreamer, TERRAIN_FRICTION } from './terrain'
import type { HeightFn, Input, PuddleFn, SimState, VehicleSpec } from './types'
import { Vehicle } from './vehicle'

/** Fixed simulation step. Rendering interpolates; physics never uses real time. */
export const STEP = 1 / 60

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
}

/** Deterministic game simulation. No DOM, no clock, no Math.random. */
export class Sim {
  readonly world: World
  readonly vehicle: Vehicle
  readonly terrain: TerrainStreamer
  private readonly startX: number
  private maxX: number
  steps = 0

  constructor(readonly options: SimOptions) {
    this.world = new World({ gravity: new Vec2(0, -(options.gravity ?? 10)) })
    this.terrain = new TerrainStreamer(this.world, options.height, options.groundFriction ?? TERRAIN_FRICTION)
    const startX = options.start?.x ?? 0
    this.terrain.ensure(startX - BEHIND, startX + AHEAD)
    const ground = this.terrain.body

    const x = options.start?.x ?? 0
    const lowestWheel = Math.min(...options.vehicle.wheels.map((w) => w.anchor.y - w.radius))
    const y = options.start?.y ?? options.height(x) - lowestWheel + 0.05
    this.vehicle = new Vehicle(this.world, options.vehicle, ground, { x, y })
    this.startX = x
    this.maxX = x

    // Grip per wheel contact: puddles cost grip; the Marsh Rover's studs keep a minimum.
    const { puddles } = options
    const amphibious = options.vehicle.amphibious
    if (puddles || amphibious) {
      const wheels = new Set(this.vehicle.wheels)
      this.world.on('pre-solve', (contact) => {
        const a = contact.getFixtureA().getBody()
        const b = contact.getFixtureB().getBody()
        const wheel = wheels.has(a) ? a : wheels.has(b) ? b : null
        if (!wheel || (a !== ground && b !== ground)) return
        let f = contact.getFriction()
        // Studs bite only on slippery ground (snow, ice, mud, sand); on grass and rock the
        // soft balloon tyres are all it has.
        if (amphibious && (options.groundFriction ?? TERRAIN_FRICTION) < 0.7) f = Math.max(f, amphibious.minGrip)
        else {
          const p = puddles?.(wheel.getPosition().x)
          if (p) f *= p.grip
        }
        contact.setFriction(f)
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
    this.terrain.ensure(x - BEHIND, x + AHEAD)
    this.vehicle.applyInput(input)
    this.puddleDrag()
    this.world.step(STEP, 8, 3)
    this.vehicle.limitTravel()
    this.steps++
    this.maxX = Math.max(this.maxX, this.vehicle.chassis.getPosition().x)
  }

  state(): SimState {
    const { chassis, wheels } = this.vehicle
    const p = chassis.getPosition()
    const contacts = this.vehicle.wheelContacts()
    return {
      chassis: { x: p.x, y: p.y, angle: chassis.getAngle() },
      wheels: wheels.map((w) => ({ x: w.getPosition().x, y: w.getPosition().y, angle: w.getAngle() })),
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
