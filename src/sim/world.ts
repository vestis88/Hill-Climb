import { Vec2, World } from 'planck'
import { TerrainStreamer, TERRAIN_FRICTION } from './terrain'
import type { HeightFn, Input, SimState, VehicleSpec } from './types'
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
  /** Gravity while the vehicle is airborne; defaults to gravity. Lower makes jumps floatier. */
  airGravity?: number
  /** Vehicle start position. y defaults to resting just above the ground. */
  start?: { x: number; y?: number }
  /** Friction of the ground surface. */
  groundFriction?: number
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
    this.vehicle = new Vehicle(this.world, options.vehicle, ground, { x, y }, options.gravity ?? 10)
    this.startX = x
    this.maxX = x
  }

  step(input: Input): void {
    const x = this.vehicle.chassis.getPosition().x
    this.terrain.ensure(x - BEHIND, x + AHEAD)
    this.vehicle.applyInput(input)
    const g = this.options.gravity ?? 10
    this.vehicle.applyAirLift(g, this.options.airGravity ?? g)
    this.world.step(STEP, 8, 3)
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
    }
  }
}
