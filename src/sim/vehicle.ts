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
        new Vec2(w.axis?.x ?? 0, w.axis?.y ?? 1),
      )
      world.createJoint(joint)
      this.wheels.push(wheel)
      this.joints.push(joint)
    }
  }

  /** Gear engaged, and steps left of the shift under way (drive is cut while shifting). */
  gear = 1
  private shiftSteps = 0
  /** Steps since the last shift, and wheel speed smoothed over about a quarter second. */
  private sinceShift = 0
  private smoothRpm = 0

  get shifting(): boolean {
    return this.shiftSteps > 0
  }

  /** Engine revs in the current gear, 0..1 (wheel speed without a gearbox). */
  revs(): number {
    const box = this.spec.engine.gearbox
    if (!box) return this.rpm()
    return Math.min(1, this.rpm() / gearTop(this.gear, box.gears))
  }

  /**
   * Shift up near the top of a gear on the gas, and down when revs sag. Decided from smoothed
   * wheel speed, never in the air, and at least 0.7 s apart (sooner only to save a stall), so
   * bumps and wheel spin do not make it hunt. Call once per step.
   */
  private updateGearbox(gas: boolean, grounded: boolean): void {
    const box = this.spec.engine.gearbox
    if (!box) return
    this.smoothRpm += (this.rpm() - this.smoothRpm) * 0.07
    this.sinceShift++
    if (this.shiftSteps > 0) {
      this.shiftSteps--
      return
    }
    if (!grounded) return
    const revs = this.smoothRpm / gearTop(this.gear, box.gears)
    const settled = this.sinceShift > 42
    if (gas && settled && revs > 0.93 && this.gear < box.gears) {
      this.gear++
      this.shiftSteps = Math.round(box.shiftTime * 60)
      this.sinceShift = 0
    } else if (this.gear > 1 && ((settled && revs < 0.4) || revs < 0.2)) {
      this.gear--
      this.sinceShift = 0
    }
  }

  /** Steps left in which a fresh back-wheel landing limits the rider's wheelie control. */
  private landingSteps = 0
  private wasAirborne = false

  /** Slope of the ground under a wheel, radians, from its contact normal (0 when not touching). */
  private groundSlope(wheel: Body): number {
    for (let edge = wheel.getContactList(); edge; edge = edge.next ?? null) {
      if (edge.other !== this.ground || !edge.contact.isTouching()) continue
      const n = edge.contact.getWorldManifold(null)?.normal
      if (!n) continue
      const up = n.y < 0 ? Vec2.neg(n) : n
      return Math.atan2(-up.x, up.y)
    }
    return 0
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
    this.updateGearbox(input.gas && !input.brake, this.wheelContacts().some(Boolean))
    // While shifting, the drive is briefly cut.
    const shiftCut = this.shiftSteps > 0 && engine.gearbox ? engine.gearbox.cut : 1
    const driveTorque = engine.maxTorque * (1 - engine.torqueFalloff * rpm * rpm) * taper * shiftCut

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
        // Brakes act on every wheel, then pull the car into reverse (not with an empty tank).
        joint.setMotorSpeed(input.empty ? 0 : engine.reverseWheelSpeed)
        joint.setMaxMotorTorque(w.axle === 'rear' ? engine.brakeTorque : engine.brakeTorque * 0.5)
      } else {
        joint.setMotorSpeed(0)
        joint.setMaxMotorTorque(engine.idleDragTorque)
      }
    })

    // Pedals also pitch the chassis.
    const wheelie = airControl.wheelie
    const landing = this.wasAirborne && contacts.some(Boolean)
    this.wasAirborne = !contacts.some(Boolean)
    if (landing) this.landingSteps = wheelie?.landing ? Math.round(wheelie.landing.seconds * 60) : 0
    if (wheelie && contacts.some(Boolean)) {
      const spin = this.chassis.getAngularVelocity()
      const rearDown = this.spec.wheels.some((w, i) => w.axle === 'rear' && contacts[i])
      const frontDown = this.spec.wheels.some((w, i) => w.axle === 'front' && contacts[i])
      // The bike pivots about its back wheel, so steer it with the rig's inertia about that hub.
      const rear = this.wheels[this.spec.wheels.findIndex((w) => w.axle === 'rear')]
      const arm = Vec2.sub(this.chassis.getWorldCenter(), rear.getWorldCenter())
      const mass = this.chassis.getMass() + this.wheels.reduce((m, w) => m + w.getMass(), 0)
      if (rearDown && !frontDown && Math.abs(this.chassis.getAngle()) < 1.8) {
        // On the back wheel: the rider holds the pitch to a steady rate up or down.
        const target = gas ? wheelie.rate : brake ? -2 * wheelie.drop : -wheelie.drop
        const inertia = this.rigInertia() + mass * Vec2.dot(arm, arm)
        // Just after landing on the back wheel the rider only has control if the bike came down
        // balanced, nose well up; with the front near the ground the impact slaps it down.
        let authority = 1
        if (this.landingSteps > 0 && wheelie.landing) {
          const nose = this.chassis.getAngle() - this.groundSlope(rear)
          const [low, high] = wheelie.landing.balance
          authority = Math.min(1, Math.max(0, (nose - low) / (high - low)))
        }
        this.chassis.applyTorque(authority * inertia * wheelie.response * (target - spin), true)
      } else if (gas && spin < wheelie.rate) {
        // Both wheels down: the gas lifts the front. `lift` is a share of the bike's weight
        // moment about the back wheel, scaled by how hard the engine pulls (so mostly at launch).
        const weight = mass * Math.abs(this.world.getGravity().y) * Math.abs(arm.x)
        this.chassis.applyTorque(wheelie.lift * weight * (driveTorque / engine.maxTorque), true)
      } else if (brake && spin > -airControl.spinRate) {
        this.chassis.applyTorque(-airControl.groundTorque, true)
      }
      if (this.landingSteps > 0) this.landingSteps--
    } else if (gas || brake) {
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
   * with an impulse shared with the chassis, as when a fork bottoms out. The hub is also held
   * on its axis: on a hard landing the joint's own sideways hold gives, most of all on a
   * tilted axis (the bike's swingarm and fork).
   */
  limitTravel(): void {
    this.spec.wheels.forEach((w, i) => {
      if (!w.travel) return
      const wheel = this.wheels[i]
      const axis = this.chassis.getWorldVector(new Vec2(w.axis?.x ?? 0, w.axis?.y ?? 1))
      const side = new Vec2(-axis.y, axis.x)
      const anchor = this.chassis.getWorldPoint(new Vec2(w.anchor.x, w.anchor.y))
      const offset = Vec2.sub(wheel.getPosition(), anchor)
      const t = Vec2.dot(offset, axis)
      const over = t > w.travel.up ? t - w.travel.up : t < -w.travel.down ? t + w.travel.down : 0
      if (over !== 0) this.separate(wheel, axis, over, true)
      const drift = Vec2.dot(offset, side)
      if (Math.abs(drift) > 0.002) this.separate(wheel, side, drift, false)
    })
  }

  /**
   * Move a wheel back by `error` along `dir` (sharing the fix with the chassis by mass) and take
   * out their relative speed along `dir`: only the part making the error worse when `oneWay`.
   */
  private separate(wheel: Body, dir: Vec2, error: number, oneWay: boolean): void {
    const mA = this.chassis.getMass()
    const mB = wheel.getMass()
    const hub = wheel.getPosition()
    // Share the position fix by mass, so the wheel does not sink into the ground.
    wheel.setPosition(Vec2.sub(hub, Vec2.mul(dir, (error * mA) / (mA + mB))))
    this.chassis.setPosition(Vec2.add(this.chassis.getPosition(), Vec2.mul(dir, (error * mB) / (mA + mB))))
    const vRel = Vec2.dot(Vec2.sub(wheel.getLinearVelocity(), this.chassis.getLinearVelocityFromWorldPoint(hub)), dir)
    if (oneWay && vRel * error <= 0) return
    const r = Vec2.sub(hub, this.chassis.getWorldCenter())
    const rn = Vec2.cross(r, dir)
    const impulse = vRel / (1 / mA + 1 / mB + (rn * rn) / this.chassis.getInertia())
    wheel.applyLinearImpulse(Vec2.mul(dir, -impulse), wheel.getWorldCenter(), true)
    this.chassis.applyLinearImpulse(Vec2.mul(dir, impulse), hub, true)
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

/** Share of top wheel speed at which a gear tops out: lower gears are shorter. */
export const gearTop = (gear: number, gears: number) => Math.pow(gear / gears, 0.75)

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
