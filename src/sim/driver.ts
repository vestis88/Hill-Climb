import { Body, Box, Circle, RevoluteJoint, Vec2, World } from 'planck'
import type { Pose, VehicleSpec } from './types'
import type { Vehicle } from './vehicle'

/** Where the driver sits, in chassis coordinates: below the head by the torso length. */
export const TORSO_LENGTH = 0.75
export const seatOf = (spec: VehicleSpec) => ({ x: spec.driver.head.x, y: spec.driver.head.y - TORSO_LENGTH })

/**
 * While driving, the driver's upper body sways with the car: it leans back when
 * accelerating, forward when braking, and bobs on landings. A damped spring on one
 * angle, visual only; it does not push on the car, so handling is unaffected.
 */
export class DriverSway {
  /** Lean back from upright, radians (positive leans towards the rear). */
  lean = 0
  private velocity = 0
  private last: Vec2 | null = null

  update(chassis: Body, dt: number): void {
    const v = chassis.getLinearVelocity().clone()
    const prev = this.last ?? v
    this.last = v
    // Acceleration of the seat in the car's own frame.
    const a = chassis.getLocalVector(Vec2.mul(Vec2.sub(v, prev), 1 / dt))
    const stiffness = 60
    const damping = 9
    const push = 0.05 * a.x + 0.02 * a.y
    this.velocity += (-stiffness * this.lean - damping * this.velocity + push * stiffness) * dt
    this.lean = Math.max(-0.5, Math.min(0.5, this.lean + this.velocity * dt))
  }
}

/** After a crash the driver goes limp: a torso and head on joints, flopping with the car. */
export class Ragdoll {
  readonly torso: Body
  readonly head: Body

  constructor(world: World, vehicle: Vehicle, lean: number) {
    const spec = vehicle.spec
    const chassis = vehicle.chassis
    const seat = seatOf(spec)
    const { head: headLocal, headRadius } = spec.driver
    const angle = chassis.getAngle() + lean
    const world_ = (local: { x: number; y: number }) => chassis.getWorldPoint(new Vec2(local.x, local.y))
    const seatW = world_(seat)
    const up = new Vec2(-Math.sin(angle), Math.cos(angle))
    const mid = Vec2.add(seatW, Vec2.mul(up, TORSO_LENGTH / 2))
    const headW = Vec2.add(seatW, Vec2.mul(up, TORSO_LENGTH))
    const opts = { density: 1, friction: 0.6, restitution: 0.1, filterGroupIndex: -1 }

    this.torso = world.createDynamicBody({ position: mid, angle })
    this.torso.createFixture(new Box(0.12, TORSO_LENGTH / 2 - 0.05), opts)
    this.head = world.createDynamicBody({ position: headW, angle })
    this.head.createFixture(new Circle(headRadius), opts)
    for (const body of [this.torso, this.head]) {
      body.setLinearVelocity(chassis.getLinearVelocityFromWorldPoint(body.getPosition()))
      body.setAngularVelocity(chassis.getAngularVelocity())
    }
    world.createJoint(
      new RevoluteJoint({ enableLimit: true, lowerAngle: -1.4, upperAngle: 1.4 }, chassis, this.torso, seatW),
    )
    const neck = Vec2.add(seatW, Vec2.mul(up, TORSO_LENGTH - headRadius))
    world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -0.9, upperAngle: 0.9 }, this.torso, this.head, neck))
    void headLocal
  }

  poses(): { torso: Pose; head: Pose } {
    const pose = (b: Body) => ({ x: b.getPosition().x, y: b.getPosition().y, angle: b.getAngle() })
    return { torso: pose(this.torso), head: pose(this.head) }
  }
}
