import type { VehicleSpec } from '../sim/types'

/**
 * Starter vehicle: a small, light rear-wheel-drive runabout.
 * Values are a first pass; task P6 tunes them and locks them with tests.
 */
export const runabout: VehicleSpec = {
  id: 'runabout',
  chassis: {
    polygon: [
      { x: -1.45, y: -0.25 },
      { x: 1.45, y: -0.25 },
      { x: 1.5, y: 0.15 },
      { x: 0.55, y: 0.3 },
      { x: 0.2, y: 0.75 },
      { x: -0.9, y: 0.75 },
      { x: -1.5, y: 0.25 },
    ],
    mass: 9,
    centerOfMass: { x: -0.1, y: 0.05 },
  },
  wheels: [
    { anchor: { x: -0.95, y: -0.55 }, radius: 0.42, mass: 1, friction: 1.6, springHz: 3.2, damping: 0.45, driven: true },
    { anchor: { x: 1.0, y: -0.55 }, radius: 0.42, mass: 1, friction: 1.6, springHz: 3.2, damping: 0.45, driven: false },
  ],
  engine: {
    maxTorque: 30,
    torqueFalloff: 0.5,
    maxWheelSpeed: 42,
    brakeTorque: 30,
    reverseWheelSpeed: 14,
    idleDragTorque: 1.2,
  },
  airControl: {
    gasTorque: 46,
    brakeTorque: 46,
    maxSpin: 4.2,
    groundFactor: 0.2,
  },
}
