import { Body, Circle, Polygon, Vec2, WheelJoint, World } from 'planck'
import type { Input, VehicleSpec } from './types'

/**
 * A vehicle rig: chassis + wheels on sprung wheel joints.
 *
 * Convention: the vehicle faces +x. Positive rotation is counter-clockwise,
 * so "nose up" is positive chassis torque and forward wheel spin is negative.
 */
export class Vehicle {
  readonly chassis: Body
  readonly wheels: Body[] = []
  readonly joints: WheelJoint[] = []

  constructor(
    private readonly world: World,
    readonly spec: VehicleSpec,
    private readonly ground: Body,
    position: { x: number; y: number },
  ) {
    const origin = new Vec2(position.x, position.y)

    this.chassis = world.createDynamicBody({ position: origin })
    this.chassis.createFixture(new Polygon(spec.chassis.polygon.map((p) => new Vec2(p.x, p.y))), {
      density: 1,
      friction: 0.4,
      filterGroupIndex: -1, // never collide with own wheels
    })
    setMass(this.chassis, spec.chassis.mass, spec.chassis.centerOfMass, spec.chassis.inertiaScale ?? 1)

    for (const w of spec.wheels) {
      const hub = new Vec2(origin.x + w.anchor.x, origin.y + w.anchor.y)
      const wheel = world.createDynamicBody({ position: hub })
      wheel.createFixture(new Circle(w.radius), {
        density: w.mass / (Math.PI * w.radius * w.radius),
        friction: w.friction,
        filterGroupIndex: -1,
      })
      const joint = new WheelJoint(
        { frequencyHz: w.springHz, dampingRatio: w.damping, enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 },
        this.chassis,
        wheel,
        hub,
        new Vec2(0, 1),
      )
      world.createJoint(joint)
      this.wheels.push(wheel)
      this.joints.push(joint)
    }
  }

  /** True for each wheel currently touching the ground. */
  wheelContacts(): boolean[] {
    return this.wheels.map((wheel) => {
      for (let edge = wheel.getContactList(); edge; edge = edge.next ?? null) {
        if (edge.other === this.ground && edge.contact.isTouching()) return true
      }
      return false
    })
  }

  /** Apply pedal input for one fixed step. Call before world.step. */
  applyInput(input: Input): void {
    const { engine, airControl } = this.spec
    const gas = input.gas && !input.brake
    const brake = input.brake && !input.gas
    const both = input.gas && input.brake
    // Drive torque fades towards top speed, so launches are punchy and the nose settles as speed builds.
    const rpm = this.rpm()
    // Power also fades smoothly over the top of the speed range, so the car eases up to its
    // top speed instead of hitting a hard limit; the motor aims a little above top speed so it
    // never locks the wheels at an exact speed.
    const t = Math.min(1, Math.max(0, (1 - rpm) / TAPER))
    const taper = t * t * (3 - 2 * t)
    const driveTorque = engine.maxTorque * (1 - engine.torqueFalloff * rpm * rpm) * taper

    const contacts = this.wheelContacts()
    const axleCount = { rear: 0, front: 0 }
    for (const w of this.spec.wheels) axleCount[w.axle]++

    this.spec.wheels.forEach((w, i) => {
      const joint = this.joints[i]
      // The rear always gets full drive; the drivetrain upgrade adds drive at the front on top.
      const share = w.axle === 'rear' ? 1 : engine.frontShare
      if (both) {
        // Both pedals: hold the wheels.
        joint.setMotorSpeed(0)
        joint.setMaxMotorTorque(engine.brakeTorque)
      } else if (gas && share > 0) {
        joint.setMotorSpeed(-engine.maxWheelSpeed * 1.15)
        joint.setMaxMotorTorque((driveTorque * share) / axleCount[w.axle])
      } else if (brake) {
        // Brakes act on every wheel, then pull the car into reverse.
        joint.setMotorSpeed(engine.reverseWheelSpeed)
        joint.setMaxMotorTorque(w.axle === 'rear' ? engine.brakeTorque : engine.brakeTorque * 0.5)
      } else {
        joint.setMotorSpeed(0)
        joint.setMaxMotorTorque(engine.idleDragTorque)
      }
    })

    // Pedals also pitch the chassis.
    if (gas || brake) {
      const dir = gas ? 1 : -1
      const spin = this.chassis.getAngularVelocity()
      if (contacts.some(Boolean)) {
        // On the ground: a light push that helps wheelies and nose-downs.
        if (spin * dir < airControl.spinRate) this.chassis.applyTorque(dir * airControl.groundTorque, true)
      } else {
        // In the air: steer the spin towards a fixed rate. It responds almost at once
        // and then holds that rate, instead of building up speed the longer the pedal is held.
        const target = dir * airControl.spinRate
        if ((target - spin) * dir > 0) {
          this.chassis.applyTorque(this.rigInertia() * airControl.spinResponse * (target - spin), true)
        }
      }
    }
  }

  /**
   * Bump stops: planck's wheel joint has no travel limit, so after each step any wheel past its
   * travel (spec.wheels[i].travel) is put back at the stop and its closing speed is taken out
   * with an impulse shared with the chassis, as when a fork bottoms out.
   */
  limitTravel(): void {
    this.spec.wheels.forEach((w, i) => {
      if (!w.travel) return
      const wheel = this.wheels[i]
      const axis = this.chassis.getWorldVector(new Vec2(0, 1))
      const anchor = this.chassis.getWorldPoint(new Vec2(w.anchor.x, w.anchor.y))
      const hub = wheel.getPosition()
      const t = Vec2.dot(Vec2.sub(hub, anchor), axis)
      const over = t > w.travel.up ? t - w.travel.up : t < -w.travel.down ? t + w.travel.down : 0
      if (over === 0) return
      const mA = this.chassis.getMass()
      const mB = wheel.getMass()
      // Share the position fix by mass, so the wheel does not sink into the ground.
      wheel.setPosition(Vec2.sub(hub, Vec2.mul(axis, (over * mA) / (mA + mB))))
      const c = this.chassis.getPosition()
      this.chassis.setPosition(Vec2.add(c, Vec2.mul(axis, (over * mB) / (mA + mB))))
      // Remove the speed at which the wheel is still moving past the stop.
      const vRel = Vec2.dot(Vec2.sub(wheel.getLinearVelocity(), this.chassis.getLinearVelocityFromWorldPoint(hub)), axis)
      if (vRel * over <= 0) return
      const r = Vec2.sub(hub, this.chassis.getWorldCenter())
      const rn = Vec2.cross(r, axis)
      const impulse = vRel / (1 / mA + 1 / mB + (rn * rn) / this.chassis.getInertia())
      wheel.applyLinearImpulse(Vec2.mul(axis, -impulse), wheel.getWorldCenter(), true)
      this.chassis.applyLinearImpulse(Vec2.mul(axis, impulse), hub, true)
    })
  }

  /** Rotational inertia of the whole rig (chassis plus wheels) about the chassis centre of mass. */
  private rigInertia(): number {
    const c = this.chassis.getWorldCenter()
    let inertia = this.chassis.getInertia()
    for (const wheel of this.wheels) {
      const d = Vec2.sub(wheel.getWorldCenter(), c)
      inertia += wheel.getInertia() + wheel.getMass() * Vec2.dot(d, d)
    }
    return inertia
  }

  /** Mean driven wheel spin as a share of top wheel speed, 0..1. */
  rpm(): number {
    let sum = 0
    let n = 0
    this.spec.wheels.forEach((w, i) => {
      if (w.axle !== 'rear') return
      sum += Math.abs(this.wheels[i].getAngularVelocity() - this.chassis.getAngularVelocity())
      n++
    })
    return n ? Math.min(1, sum / n / this.spec.engine.maxWheelSpeed) : 0
  }

  /** World position of the driver's head. */
  headPosition(): { x: number; y: number } {
    const p = this.chassis.getWorldPoint(new Vec2(this.spec.driver.head.x, this.spec.driver.head.y))
    return { x: p.x, y: p.y }
  }

  destroy(): void {
    for (const wheel of this.wheels) this.world.destroyBody(wheel)
    this.world.destroyBody(this.chassis)
  }
}

/** Share of the speed range, below top speed, over which engine power fades out. */
const TAPER = 0.4

/** Override a body's mass and centre of mass, scaling its rotational inertia to match. */
function setMass(body: Body, mass: number, center: { x: number; y: number }, inertiaScale = 1): void {
  const data = { mass: 0, center: new Vec2(0, 0), I: 0 }
  body.getMassData(data)
  const oldCentroidI = data.I - data.mass * Vec2.dot(data.center, data.center)
  const c = new Vec2(center.x, center.y)
  body.setMassData({
    mass,
    center: c,
    I: oldCentroidI * (mass / data.mass) * inertiaScale + mass * Vec2.dot(c, c),
  })
}
