import type { VehicleSpec } from '../sim/types'

/**
 * Starter vehicle: a small, light rear-wheel-drive runabout.
 * This is the BASE spec: every upgrade at level 1, the worst version of the car.
 * Set by owner playtests 1 to 3. See README "Progression principle".
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
    { anchor: { x: -0.95, y: -0.55 }, radius: 0.42, mass: 1, friction: 0.36, springHz: 4.3, damping: 0.7, axle: 'rear' },
    { anchor: { x: 1.0, y: -0.55 }, radius: 0.42, mass: 1, friction: 0.36, springHz: 4.3, damping: 0.7, axle: 'front' },
  ],
  engine: {
    maxTorque: 21,
    frontShare: 0,
    torqueFalloff: 0.5,
    maxWheelSpeed: 22,
    brakeTorque: 30,
    reverseWheelSpeed: 14,
    idleDragTorque: 1.2,
  },
  driver: { head: { x: -0.3, y: 1.05 }, headRadius: 0.2 },
  airControl: {
    spinRate: 2.6,
    spinResponse: 14,
    groundTorque: 4,
  },
}

/**
 * The runabout with every upgrade at the top level. Only values that an upgrade
 * changes differ from the base; see data/upgrades.ts for which upgrade owns which.
 * First proposal, to be tuned by playtest (task P6).
 */
export const runaboutFull: VehicleSpec = {
  ...runabout,
  chassis: { ...runabout.chassis, centerOfMass: { x: -0.1, y: -0.15 } },
  wheels: runabout.wheels.map((w) => ({ ...w, friction: 0.9, damping: 0.9 })),
  engine: { ...runabout.engine, maxTorque: 24, torqueFalloff: 0.15, maxWheelSpeed: 46, frontShare: 0.3 },
}
