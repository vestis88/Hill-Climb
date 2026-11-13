import type { VehicleSpec } from '../sim/types'

/**
 * See README "Upgrades". Each upgrade owns a fixed set of physics values. Every vehicle has
 * four upgrades, chosen to suit it (see VehicleEntry.upgrades); an upgrade a vehicle does not
 * have simply stays at level 1 and changes nothing.
 */
export type UpgradeId = 'engine' | 'tyres' | 'suspension' | 'drivetrain' | 'weight' | 'flip' | 'thrust'
export type Levels = Record<UpgradeId, number>

export interface UpgradeInfo {
  id: UpgradeId
  name: string
  blurb: string
}

/**
 * Levels 1 to FULL_LEVEL go from the base vehicle to its full spec. Levels above it (to
 * MAX_LEVEL) are the "galna" levels: each pushes every value BEYOND further the same way,
 * past the full spec (so level 15 is 2.25 times as far from the base as level 10), clamped
 * where a value would stop making sense.
 */
export const FULL_LEVEL = 10
export const MAX_LEVEL = 15
export const BEYOND = 0.25

export const ENGINE: UpgradeInfo = { id: 'engine', name: 'Motor', blurb: 'Snabbare och starkare i backar' }
export const TYRES: UpgradeInfo = { id: 'tyres', name: 'Däck', blurb: 'Mindre hjulspinn, bättre bromsar' }
export const SUSPENSION: UpgradeInfo = { id: 'suspension', name: 'Fjädring', blurb: 'Mjukare landningar, välter inte lika lätt' }
export const DRIVETRAIN: UpgradeInfo = { id: 'drivetrain', name: 'Drivlina', blurb: 'Kraft till framhjulen också' }

const ALL: UpgradeId[] = ['engine', 'tyres', 'suspension', 'drivetrain', 'weight', 'flip', 'thrust']
const levelsAt = (n: number) => Object.fromEntries(ALL.map((id) => [id, n])) as Levels
export const BASE_LEVELS: Levels = levelsAt(1)
export const FULL_LEVELS: Levels = levelsAt(FULL_LEVEL)
export const MAX_LEVELS: Levels = levelsAt(MAX_LEVEL)

/** Coins to buy the given level (2..MAX_LEVEL): about 50% more each level, 25% more above FULL_LEVEL. */
export function price(level: number): number {
  const at = (l: number) => 300 * Math.pow(1.5, l - 2)
  const raw = level <= FULL_LEVEL ? at(level) : at(FULL_LEVEL) * Math.pow(1.25, level - FULL_LEVEL)
  return Math.round(raw / 10) * 10
}

// Exact at both ends, so level 1 is the base spec and FULL_LEVEL the full spec; t above 1
// (the galna levels) carries on past the full spec.
const lerp = (a: number, b: number, t: number) => (t === 1 || a === b ? b : a * (1 - t) + b * t)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/**
 * The vehicle at the given upgrade levels: each value owned by an upgrade moves
 * from its base value (level 1) to its full value (MAX_LEVEL) in equal steps.
 * Pure data in, data out; no physics logic lives here.
 */
export function applyUpgrades(base: VehicleSpec, full: VehicleSpec, levels: Levels): VehicleSpec {
  const t = (id: UpgradeId) => {
    const l = Math.min(MAX_LEVEL, Math.max(1, levels[id]))
    return l <= FULL_LEVEL ? (l - 1) / (FULL_LEVEL - 1) : 1 + (l - FULL_LEVEL) * BEYOND
  }
  const e = t('engine')
  const g = t('tyres')
  const s = t('suspension')
  const d = t('drivetrain')
  const w = t('weight')
  const f = t('flip')
  const th = t('thrust')
  return {
    ...base,
    chassis: {
      ...base.chassis,
      mass: Math.max(base.chassis.mass * 0.35, lerp(base.chassis.mass, full.chassis.mass, w)),
      centerOfMass: {
        x: lerp(base.chassis.centerOfMass.x, full.chassis.centerOfMass.x, s),
        y: lerp(base.chassis.centerOfMass.y, full.chassis.centerOfMass.y, s),
      },
    },
    wheels: base.wheels.map((w, i) => ({
      ...w,
      friction: clamp(lerp(w.friction, full.wheels[i].friction, g), 0.05, 3),
      springHz: clamp(lerp(w.springHz, full.wheels[i].springHz, s), 0.8, 14),
      damping: clamp(lerp(w.damping, full.wheels[i].damping, s), 0.05, 1.6),
    })),
    engine: {
      ...base.engine,
      maxTorque: lerp(base.engine.maxTorque, full.engine.maxTorque, e),
      torqueFalloff: clamp(lerp(base.engine.torqueFalloff, full.engine.torqueFalloff, e), 0, 0.95),
      maxWheelSpeed: lerp(base.engine.maxWheelSpeed, full.engine.maxWheelSpeed, e),
      frontShare: clamp(lerp(base.engine.frontShare, full.engine.frontShare, d), 0, 1),
    },
    // Studded tyres (Marsh Rover): the Tyres upgrade raises the grip they never drop below.
    ...(base.amphibious ? { amphibious: { minGrip: clamp(lerp(base.amphibious.minGrip, full.amphibious?.minGrip ?? base.amphibious.minGrip, g), 0, 1.5) } } : {}),
    // Thrusters (Moon Lander): the Thrust upgrade makes the tank last longer and refill faster.
    ...(base.thrusters && full.thrusters ? { thrusters: { push: base.thrusters.push, seconds: lerp(base.thrusters.seconds, full.thrusters.seconds, th), refill: lerp(base.thrusters.refill, full.thrusters.refill, th) } } : {}),
    airControl: {
      ...base.airControl,
      spinRate: lerp(base.airControl.spinRate, full.airControl.spinRate, f),
      spinResponse: lerp(base.airControl.spinResponse, full.airControl.spinResponse, f),
    },
  }
}
