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
    revTime: 0.6,
    reverseWheelSpeed: 14,
    idleDragTorque: 1.2,
    gearbox: { gears: 4, shiftTime: 0.15, cut: 0.5 },
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
    // The rear hub moves across the swingarm (pivot at -0.12, -0.02), so it swings back as it
    // rises; the front slides up the raked fork. Wheelbase 1.74 m.
    { anchor: { x: -0.84, y: -0.4 }, radius: 0.38, mass: 0.5, friction: 0.36, springHz: 4, damping: 0.6, axle: 'rear', axis: { x: -0.29, y: 0.957 }, travel: { up: 0.32, down: 0.1 } },
    { anchor: { x: 0.9, y: -0.4 }, radius: 0.38, mass: 0.5, friction: 0.36, springHz: 4, damping: 0.6, axle: 'front', axis: { x: -0.428, y: 0.904 }, travel: { up: 0.32, down: 0.1 } },
  ],
  engine: {
    maxTorque: 7,
    frontShare: 0,
    torqueFalloff: 0.5,
    maxWheelSpeed: 35,
    brakeTorque: 12,
    revTime: 0.35,
    reverseWheelSpeed: 12,
    idleDragTorque: 0.4,
    gearbox: { gears: 5, shiftTime: 0.08, cut: 0.6 },
  },
  driver: { head: { x: -0.15, y: 1.25 }, headRadius: 0.2 },
  // Owner playtests: too little grip and over-rotated in the air; keep the wheelies, rotate more
  // slowly. (Extra body inertia was tried for slower rotation, but then the bike could not level
  // itself in time on Crater Fields' big jumps.)
  // Wheelies (owner): full gas lifts the front at launch, and on the back wheel the pitch moves
  // at a steady rate (up on the gas, down off it), so it is easy to start and to feather.
  airControl: { spinRate: 2.4, spinResponse: 11, groundTorque: 2, wheelie: { lift: 1.15, rate: 1, drop: 1.2, response: 12, landing: { seconds: 0.4, balance: [0.35, 0.75] } } },
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
    revTime: 1.1,
    reverseWheelSpeed: 7,
    idleDragTorque: 4,
    gearbox: { gears: 4, shiftTime: 0.25, cut: 0.55 },
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

/**
 * Marsh Rover: a light amphibious buggy on big balloon paddle tyres. Puddles do not slow it and
 * on slippery ground (snow, ice, mud, sand) its studs never grip less than 0.7 (others get about
 * 0.4 to 0.65 on ice), so it shines there; on grass and rock it runs on soft balloon tyres.
 * Stage times: the best on Frost Pass and Moonlit Woods at low and mid levels, level with the
 * (dearer) Hauler when fully upgraded, and about even with the others on dry maps. Base spec.
 */
export const rover: VehicleSpec = {
  id: 'rover',
  chassis: {
    polygon: [
      { x: -1.25, y: -0.2 },
      { x: 1.2, y: -0.2 },
      { x: 1.45, y: 0.2 },
      { x: 0.6, y: 0.35 },
      { x: -0.9, y: 0.35 },
      { x: -1.35, y: 0.15 },
    ],
    mass: 8,
    centerOfMass: { x: 0, y: -0.05 },
  },
  wheels: [
    { anchor: { x: -0.95, y: -0.5 }, radius: 0.55, mass: 1, friction: 0.4, springHz: 3.2, damping: 0.55, axle: 'rear' },
    { anchor: { x: 0.95, y: -0.5 }, radius: 0.55, mass: 1, friction: 0.4, springHz: 3.2, damping: 0.55, axle: 'front' },
  ],
  engine: {
    maxTorque: 28,
    frontShare: 0.3,
    torqueFalloff: 0.5,
    maxWheelSpeed: 21,
    // Strong brakes, so grip (the Tyres upgrade) decides how fast it stops.
    brakeTorque: 60,
    revTime: 0.85,
    reverseWheelSpeed: 9,
    idleDragTorque: 1.5,
    gearbox: { gears: 3, shiftTime: 0.15, cut: 0.5 },
  },
  amphibious: { minGrip: 0.7 },
  driver: { head: { x: -0.2, y: 1.05 }, headRadius: 0.2 },
  // No extra pedal push on the ground: with this much torque it would flip at launch.
  airControl: { spinRate: 2.2, spinResponse: 11, groundTorque: 0 },
}

export const roverFull: VehicleSpec = {
  ...rover,
  wheels: rover.wheels.map((w) => ({ ...w, friction: 0.95, damping: 0.8 })),
  chassis: { ...rover.chassis, mass: 6.5, centerOfMass: { x: 0, y: -0.35 } },
  engine: { ...rover.engine, maxTorque: 42, torqueFalloff: 0.35, maxWheelSpeed: 33 },
  amphibious: { minGrip: 0.95 },
}

/**
 * Tractor: huge rear wheels and a tiny front pair, a low and forward weight. Very slow, but it
 * climbs almost anything and hardly ever tips over backwards; a good first vehicle for a young
 * driver. The drivetrain upgrade adds front-wheel drive. Base spec.
 */
export const tractor: VehicleSpec = {
  id: 'tractor',
  chassis: {
    polygon: [
      { x: -1.15, y: -0.3 },
      { x: 1.55, y: -0.3 },
      { x: 1.6, y: 0.35 },
      { x: 0.2, y: 0.45 },
      { x: -1.1, y: 0.4 },
    ],
    mass: 13,
    centerOfMass: { x: 0.35, y: -0.2 },
  },
  wheels: [
    { anchor: { x: -0.85, y: -0.3 }, radius: 0.8, mass: 2.4, friction: 0.55, springHz: 3.2, damping: 0.75, axle: 'rear' },
    { anchor: { x: 1.25, y: -0.62 }, radius: 0.42, mass: 0.8, friction: 0.55, springHz: 3.6, damping: 0.75, axle: 'front' },
  ],
  engine: {
    maxTorque: 62,
    frontShare: 0,
    torqueFalloff: 0.35,
    maxWheelSpeed: 12,
    brakeTorque: 70,
    revTime: 0.95,
    reverseWheelSpeed: 5,
    idleDragTorque: 3,
    gearbox: { gears: 3, shiftTime: 0.3, cut: 0.5 },
  },
  driver: { head: { x: -0.45, y: 1.35 }, headRadius: 0.21 },
  airControl: { spinRate: 1.4, spinResponse: 8, groundTorque: 0 },
}

export const tractorFull: VehicleSpec = {
  ...tractor,
  wheels: tractor.wheels.map((w) => ({ ...w, friction: 1.1, damping: 0.95 })),
  engine: { ...tractor.engine, maxTorque: 88, torqueFalloff: 0.2, maxWheelSpeed: 19, frontShare: 0.6 },
}

/**
 * Monster Truck: giant soft wheels on long, bouncy suspension; big air and easy backflips. Heavy
 * and thirsty: it burns fuel 40 % faster than the others. Base spec.
 */
export const monster: VehicleSpec = {
  id: 'monster',
  chassis: {
    polygon: [
      { x: -1.7, y: -0.15 },
      { x: 1.7, y: -0.15 },
      { x: 1.75, y: 0.35 },
      { x: 0.8, y: 0.45 },
      { x: 0.5, y: 1.05 },
      { x: -0.6, y: 1.05 },
      { x: -0.7, y: 0.45 },
      { x: -1.75, y: 0.4 },
    ],
    mass: 14,
    centerOfMass: { x: 0.05, y: -0.25 },
  },
  wheels: [
    { anchor: { x: -1.3, y: -0.85 }, radius: 0.95, mass: 2.6, friction: 0.35, springHz: 2.3, damping: 0.38, axle: 'rear' },
    { anchor: { x: 1.3, y: -0.85 }, radius: 0.95, mass: 2.6, friction: 0.35, springHz: 2.3, damping: 0.38, axle: 'front' },
  ],
  engine: {
    maxTorque: 60,
    frontShare: 0.5,
    torqueFalloff: 0.5,
    maxWheelSpeed: 16,
    brakeTorque: 90,
    revTime: 1.0,
    reverseWheelSpeed: 7,
    idleDragTorque: 4,
    gearbox: { gears: 4, shiftTime: 0.22, cut: 0.55 },
  },
  fuelUse: 1.4,
  driver: { head: { x: -0.05, y: 0.95 }, headRadius: 0.22 },
  airControl: { spinRate: 2.6, spinResponse: 12, groundTorque: 0 },
}

export const monsterFull: VehicleSpec = {
  ...monster,
  // A lower centre of mass when fully built: full power must not flip it at the start.
  chassis: { ...monster.chassis, centerOfMass: { x: 0.1, y: -0.4 } },
  wheels: monster.wheels.map((w) => ({ ...w, friction: 1.0, damping: 0.55 })),
  engine: { ...monster.engine, maxTorque: 90, torqueFalloff: 0.25, maxWheelSpeed: 25 },
  airControl: { ...monster.airControl, spinRate: 3.6, spinResponse: 15 },
}

/**
 * Go-kart: low, light and fast on tiny wheels with almost no suspension. Brilliant on smooth
 * ground (Dynhavet), skittish on bumps; a racer. Base spec.
 */
export const kart: VehicleSpec = {
  id: 'kart',
  chassis: {
    polygon: [
      { x: -1.05, y: -0.12 },
      { x: 1.15, y: -0.12 },
      { x: 1.2, y: 0.05 },
      { x: -1.1, y: 0.12 },
    ],
    mass: 5,
    centerOfMass: { x: 0, y: -0.15 },
  },
  wheels: [
    { anchor: { x: -0.8, y: -0.22 }, radius: 0.3, mass: 0.5, friction: 0.5, springHz: 7, damping: 1, axle: 'rear' },
    { anchor: { x: 0.85, y: -0.22 }, radius: 0.28, mass: 0.4, friction: 0.5, springHz: 7, damping: 1, axle: 'front' },
  ],
  engine: {
    maxTorque: 7,
    frontShare: 0,
    torqueFalloff: 0.45,
    maxWheelSpeed: 48,
    brakeTorque: 14,
    revTime: 0.4,
    reverseWheelSpeed: 20,
    idleDragTorque: 0.4,
    gearbox: { gears: 5, shiftTime: 0.1, cut: 0.6 },
  },
  driver: { head: { x: -0.25, y: 0.85 }, headRadius: 0.19 },
  airControl: { spinRate: 2.2, spinResponse: 11, groundTorque: 0 },
}

export const kartFull: VehicleSpec = {
  ...kart,
  chassis: { ...kart.chassis, mass: 3.6 },
  wheels: kart.wheels.map((w) => ({ ...w, friction: 1.05, springHz: 7, damping: 1.6 })),
  engine: { ...kart.engine, maxTorque: 11, torqueFalloff: 0.2, maxWheelSpeed: 75 },
}

/**
 * Snowmobile: a track on four small bogie wheels at the back and a ski in front. The studded
 * track grips on snow and ice (never under minGrip there), the ski just slides. Great on Frost
 * Pass, ordinary elsewhere. Base spec.
 */
export const snowmobile: VehicleSpec = {
  id: 'snowmobile',
  chassis: {
    polygon: [
      { x: -1.3, y: -0.15 },
      { x: 1.1, y: -0.15 },
      { x: 1.45, y: 0.25 },
      { x: 0.4, y: 0.45 },
      { x: -1.3, y: 0.3 },
    ],
    mass: 8,
    centerOfMass: { x: 0.05, y: -0.2 },
  },
  wheels: [
    { anchor: { x: -1.15, y: -0.38 }, radius: 0.24, mass: 0.4, friction: 0.45, springHz: 3.4, damping: 0.7, axle: 'rear' },
    { anchor: { x: -0.75, y: -0.4 }, radius: 0.24, mass: 0.4, friction: 0.45, springHz: 3.4, damping: 0.7, axle: 'rear' },
    { anchor: { x: -0.35, y: -0.4 }, radius: 0.24, mass: 0.4, friction: 0.45, springHz: 3.4, damping: 0.7, axle: 'rear' },
    { anchor: { x: 0.05, y: -0.38 }, radius: 0.24, mass: 0.4, friction: 0.45, springHz: 3.4, damping: 0.7, axle: 'rear' },
    { anchor: { x: 1.15, y: -0.45 }, radius: 0.2, mass: 0.3, friction: 0.05, springHz: 3.4, damping: 0.7, axle: 'front' },
  ],
  engine: {
    maxTorque: 9,
    frontShare: 0,
    torqueFalloff: 0.5,
    maxWheelSpeed: 55,
    brakeTorque: 20,
    revTime: 0.45,
    reverseWheelSpeed: 18,
    idleDragTorque: 0.5,
    gearbox: { gears: 3, shiftTime: 0.12, cut: 0.6 },
  },
  amphibious: { minGrip: 0.75 },
  driver: { head: { x: -0.35, y: 1.15 }, headRadius: 0.2 },
  airControl: { spinRate: 2.2, spinResponse: 11, groundTorque: 0 },
}

export const snowmobileFull: VehicleSpec = {
  ...snowmobile,
  chassis: { ...snowmobile.chassis, mass: 6.5 },
  wheels: snowmobile.wheels.map((w) => ({ ...w, friction: w.axle === 'front' ? 0.05 : 1.15, damping: 0.95 })),
  engine: { ...snowmobile.engine, maxTorque: 17, torqueFalloff: 0.25, maxWheelSpeed: 80 },
  amphibious: { minGrip: 1.0 },
}

export const VEHICLES: VehicleEntry[] = [
  {
    id: 'runabout', name: 'Buggyn', blurb: 'Liten, lätt och lättkörd', price: 0, base: runabout, full: runaboutFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, DRIVETRAIN],
    launchSafe: true,
  },
  {
    id: 'scrambler', name: 'Crossen', blurb: 'Lätt crossmotorcykel: snabb, voltar lätt', price: 6000, base: scrambler, full: scramblerFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'flip', name: 'Voltkontroll', blurb: 'Snurrar snabbare i luften: lättare volter' }],
    launchSafe: false,
  },
  {
    id: 'hauler', name: 'Bjässen', blurb: 'Tung 4x4: långsam, klättrar överallt', price: 15000, base: hauler, full: haulerFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'weight', name: 'Lättare kaross', blurb: 'Mindre vikt: snabbare från start och uppför backar' }],
    launchSafe: true,
  },
  {
    id: 'rover', name: 'Träskkryparen', blurb: 'Amfibie: flyter genom pölar, greppar på snö och is', price: 10000, base: rover, full: roverFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'weight', name: 'Lättare skrov', blurb: 'Mindre vikt: snabbare från start och uppför backar' }],
    launchSafe: true,
  },
  {
    id: 'tractor', name: 'Traktorn', blurb: 'Långsam men klättrar överallt och välter nästan aldrig', price: 8000, base: tractor, full: tractorFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { ...DRIVETRAIN, blurb: 'Fyrhjulsdrift: kraft till framhjulen också' }],
    launchSafe: true,
  },
  {
    id: 'kart', name: 'Kartingen', blurb: 'Låg och snabb: suverän på släta banor, studsig på gupp', price: 9000, base: kart, full: kartFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'weight', name: 'Lättare ram', blurb: 'Mindre vikt: snabbare från start och uppför backar' }],
    launchSafe: true,
  },
  {
    id: 'snowmobile', name: 'Snöskotern', blurb: 'Larvband och skida: bäst av alla på snö och is', price: 12000, base: snowmobile, full: snowmobileFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'weight', name: 'Lättare ram', blurb: 'Mindre vikt: snabbare från start och uppför backar' }],
    launchSafe: true,
  },
  {
    id: 'monster', name: 'Monstertrucken', blurb: 'Jättehjul, studsar högt, lätta bakåtvolter; törstig', price: 18000, base: monster, full: monsterFull,
    upgrades: [ENGINE, TYRES, SUSPENSION, { id: 'flip', name: 'Voltkontroll', blurb: 'Snurrar snabbare i luften: lättare volter' }],
    launchSafe: true,
  },
]

export const vehicleEntry = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]
