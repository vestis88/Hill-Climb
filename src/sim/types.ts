// Shared simulation types. Later tasks may add fields but must not rename these.

export interface Vec2 { x: number; y: number }

export interface Pose { x: number; y: number; angle: number }

export interface Input {
  gas: boolean
  brake: boolean
  /** Out of fuel: the brake still brakes (and tips the nose down in the air) but cannot reverse. */
  empty?: boolean
}

export interface WheelSpec {
  /** Hub position relative to the chassis origin, metres. */
  anchor: Vec2
  radius: number
  mass: number
  friction: number
  /** Suspension spring frequency. Lower is softer. */
  springHz: number
  /** Suspension damping ratio, 0 (bouncy) to 1 (dead). */
  damping: number
  axle: 'rear' | 'front'
  /**
   * Suspension travel limits, metres from the anchor along the chassis's up axis: the hub
   * stops at `up` above it (bottoming out) and `down` below it. No limits when absent.
   */
  travel?: { up: number; down: number }
}

export interface VehicleSpec {
  id: string
  chassis: {
    /** Convex outline, counter-clockwise, relative to the chassis origin. */
    polygon: Vec2[]
    mass: number
    centerOfMass: Vec2
    /** Multiplies the body's resistance to rotation: higher pitches up and down more slowly. Default 1. */
    inertiaScale?: number
  }
  wheels: WheelSpec[]
  engine: {
    /** Peak drive torque at the rear axle. */
    maxTorque: number
    /** Extra drive at the front axle, as a share of maxTorque: 0 is rear-wheel drive. */
    frontShare: number
    /** Share of drive torque lost at top wheel speed, 0..1. */
    torqueFalloff: number
    /** Wheel spin at top speed, rad/s. */
    maxWheelSpeed: number
    brakeTorque: number
    /** Wheel spin when reversing, rad/s. */
    reverseWheelSpeed: number
    /** Drag torque when no pedal is held. */
    idleDragTorque: number
  }
  /** The driver's head, for crash detection. The run ends if it touches the ground. */
  driver: { head: Vec2; headRadius: number }
  airControl: {
    /** Spin rate the pedals steer towards in the air, rad/s. Gas is nose up, brake nose down. */
    spinRate: number
    /** How quickly the spin reaches spinRate in the air, 1/s. Higher feels more instant. */
    spinResponse: number
    /** Torque the pedals add to the chassis while wheels are on the ground. */
    groundTorque: number
    /**
     * Rider-controlled wheelies (the bike). With both wheels down, the gas lifts the front with
     * `lift` times the bike's weight moment about the back wheel, scaled by the engine's pull
     * (so a lift above 1 raises the front at launch, and less so as speed builds). On the back wheel the
     * pitch is steered like air control: the gas raises the nose at `rate` rad/s, letting go
     * lowers it at `drop` rad/s (twice that on the brake). No sudden snaps: feather to hold it.
     */
    wheelie?: { lift: number; rate: number; drop: number; response: number }
  }
}

/** Terrain height in metres at horizontal position x. Must be deterministic. */
export type HeightFn = (x: number) => number

export interface SimState {
  chassis: Pose
  wheels: Pose[]
  /** Forward speed, m/s. */
  speed: number
  /** Driven wheel spin as a share of maxWheelSpeed, 0..1. */
  rpm: number
  /** Furthest x reached, metres from the start. */
  distance: number
  airborne: boolean
  wheelContacts: boolean[]
}
