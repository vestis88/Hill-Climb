import { DRIVETRAIN, ENGINE, SUSPENSION, TYRES, type UpgradeInfo } from './upgrades'
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
    maxWheelSpeed: 29,
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
  // 22.5, not more: the starter car stays launch-safe (see launchSafe) at Green Meadows' gravity.
  engine: { ...runabout.engine, maxTorque: 22.5, torqueFalloff: 0.15, maxWheelSpeed: 52, frontShare: 0.3 },
}

/** A vehicle the player can own: its base (worst) and fully upgraded specs. */
export interface VehicleEntry {
  id: string
  name: string
  blurb: string
  /** Coins to unlock; 0 means owned from the start. */
  price: number
  base: VehicleSpec
  full: VehicleSpec
  /** The four upgrades this vehicle offers, in garage order. */
  upgrades: UpgradeInfo[]
  /**
   * Beginner-safe: holding full gas from a standstill on flat ground never flips it over
   * backwards, at base, fully upgraded and with any single upgrade maxed (Crater Fields excepted).
   * Others, like the Scrambler, can backflip on launch: feathering the gas is the skill.
   */
  launchSafe: boolean
}

/**
 * Dirt bike: very light, quick and twitchy. Spins fast in the air and flips easily,
 * so it rewards a light touch on the pedals. Base spec (worst).
 */
export const scrambler: VehicleSpec = {
  id: 'scrambler',
  chassis: {
    polygon: [
      { x: -0.75, y: -0.1 },
      { x: 0.7, y: -0.1 },
      { x: 0.8, y: 0.25 },
      { x: 0.1, y: 0.35 },
      { x: -0.6, y: 0.3 },
    ],
    mass: 4,
    centerOfMass: { x: -0.05, y: 0.25 },
  },
  wheels: [
    // Travel stops the tyres short of the mudguards (owner: wheels must never go through them).
    { anchor: { x: -0.78, y: -0.4 }, radius: 0.38, mass: 0.5, friction: 0.36, springHz: 4, damping: 0.6, axle: 'rear', travel: { up: 0.32, down: 0.1 } },
    { anchor: { x: 0.84, y: -0.4 }, radius: 0.38, mass: 0.5, friction: 0.36, springHz: 4, damping: 0.6, axle: 'front', travel: { up: 0.32, down: 0.1 } },
  ],
  engine: {
    maxTorque: 7,
    frontShare: 0,
    torqueFalloff: 0.5,
    maxWheelSpeed: 35,
    brakeTorque: 12,
    reverseWheelSpeed: 12,
    idleDragTorque: 0.4,
  },
  driver: { head: { x: -0.15, y: 1.25 }, headRadius: 0.2 },
  // Owner playtests: too little grip and over-rotated in the air; keep the wheelies, rotate more
  // slowly. (Extra body inertia was tried for slower rotation, but then the bike could not level
  // itself in time on Crater Fields' big jumps.)
  // Wheelies (owner): full gas lifts the front at launch, and on the back wheel the pitch moves
  // at a steady rate (up on the gas, down off it), so it is easy to start and to feather.
  airControl: { spinRate: 2.4, spinResponse: 11, groundTorque: 2, wheelie: { lift: 1.15, rate: 1, drop: 1.2, response: 12 } },
}

export const scramblerFull: VehicleSpec = {
  ...scrambler,
  wheels: scrambler.wheels.map((w) => ({ ...w, friction: 1.1, damping: 0.85 })),
  chassis: { ...scrambler.chassis, centerOfMass: { x: -0.05, y: 0.05 } },
  engine: { ...scrambler.engine, maxTorque: 8, torqueFalloff: 0.35, maxWheelSpeed: 64 },
  // Flip control: spins faster and snaps into the spin sooner in the air (owner: easier to flip).
  airControl: { ...scrambler.airControl, spinRate: 3.6, spinResponse: 16 },
}

/**
 * Hauler: a big, heavy 4x4. Slow, very stable, and climbs almost anything once
 * upgraded. Already part-time four-wheel drive at base. Base spec (worst).
 */
export const hauler: VehicleSpec = {
  id: 'hauler',
  chassis: {
    polygon: [
      { x: -2.1, y: -0.3 },
      { x: 2.1, y: -0.3 },
      { x: 2.15, y: 0.3 },
      { x: 0.9, y: 0.4 },
      { x: 0.6, y: 1.1 },
      { x: -0.6, y: 1.1 },
      { x: -0.7, y: 0.45 },
      { x: -2.1, y: 0.45 },
    ],
    mass: 26,
    centerOfMass: { x: 0, y: 0.05 },
  },
  wheels: [
    { anchor: { x: -1.45, y: -0.7 }, radius: 0.62, mass: 2.5, friction: 0.28, springHz: 3.4, damping: 0.65, axle: 'rear' },
    { anchor: { x: 1.45, y: -0.7 }, radius: 0.62, mass: 2.5, friction: 0.28, springHz: 3.4, damping: 0.65, axle: 'front' },
  ],
  engine: {
    maxTorque: 70,
    frontShare: 0.5,
    torqueFalloff: 0.5,
    maxWheelSpeed: 17,
    brakeTorque: 90,
    reverseWheelSpeed: 7,
    idleDragTorque: 4,
  },
  driver: { head: { x: -0.05, y: 0.95 }, headRadius: 0.22 },
  airControl: { spinRate: 1.9, spinResponse: 10, groundTorque: 10 },
}

export const haulerFull: VehicleSpec = {
  ...hauler,
  chassis: { ...hauler.chassis, mass: 19, centerOfMass: { x: 0, y: -0.15 } },
  wheels: hauler.wheels.map((w) => ({ ...w, friction: 1.05, damping: 0.9 })),
  engine: { ...hauler.engine, maxTorque: 90, torqueFalloff: 0.15, maxWheelSpeed: 32 },
}

export const VEHICLES: VehicleEntry[] = [
  {
    id: 'runabout', name: 'Runabout', blurb: 'Small, light, easy to handle', price: 0, base: runabout, full: runaboutFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, DRIVETRAIN],
    launchSafe: true,
  },
  {
    id: 'scrambler', name: 'Scrambler', blurb: 'Light dirt bike: fast, flips easily', price: 6000, base: scrambler, full: scramblerFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'flip', name: 'Flip control', blurb: 'Spins faster in the air: easier flips' }],
    launchSafe: false,
  },
  {
    id: 'hauler', name: 'Hauler', blurb: 'Heavy 4x4: slow, climbs anything', price: 15000, base: hauler, full: haulerFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'weight', name: 'Lighter body', blurb: 'Sheds weight: quicker off the line and up hills' }],
    launchSafe: true,
  },
]

export const vehicleEntry = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]
