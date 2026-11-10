import { Vec2, World } from 'planck'
import { buildTerrain } from './terrain'
import type { HeightFn, Input, SimState, VehicleSpec } from './types'
import { Vehicle } from './vehicle'

/** Fixed simulation step. Rendering interpolates; physics never uses real time. */
export const STEP = 1 / 60

/** Length of the current fixed test track, metres. Task P4 replaces this with endless terrain. */
export const TRACK_LENGTH = 4000

export interface SimOptions {
  vehicle: VehicleSpec
  height: HeightFn
  gravity?: number
  /** Vehicle start position. y defaults to resting just above the ground. */
  start?: { x: number; y?: number }
  /** Terrain span to build, metres. */
  span?: { from: number; to: number }
}

/** Deterministic game simulation. No DOM, no clock, no Math.random. */
export class Sim {
  readonly world: World
  readonly vehicle: Vehicle
  private readonly startX: number
  private maxX: number
  steps = 0

  constructor(readonly options: SimOptions) {
    this.world = new World({ gravity: new Vec2(0, -(options.gravity ?? 10)) })
    const span = options.span ?? { from: -30, to: TRACK_LENGTH + 60 }
    const ground = buildTerrain(this.world, options.height, span.from, span.to)

    const x = options.start?.x ?? 0
    const lowestWheel = Math.min(...options.vehicle.wheels.map((w) => w.anchor.y - w.radius))
    const y = options.start?.y ?? options.height(x) - lowestWheel + 0.05
    this.vehicle = new Vehicle(this.world, options.vehicle, ground, { x, y })
    this.startX = x
    this.maxX = x
  }

  step(input: Input): void {
    this.vehicle.applyInput(input)
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
