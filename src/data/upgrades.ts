import type { VehicleSpec } from '../sim/types'

/**
 * See README "Upgrades". Each upgrade owns a fixed set of physics values. Every vehicle has
 * four upgrades, chosen to suit it (see VehicleEntry.upgrades); an upgrade a vehicle does not
 * have simply stays at level 1 and changes nothing.
 */
export type UpgradeId = 'engine' | 'tyres' | 'suspension' | 'drivetrain' | 'weight' | 'flip'
export type Levels = Record<UpgradeId, number>

export interface UpgradeInfo {
  id: UpgradeId
  name: string
  blurb: string
}

export const MAX_LEVEL = 10

export const ENGINE: UpgradeInfo = { id: 'engine', name: 'Motor', blurb: 'Snabbare och starkare i backar' }
export const TYRES: UpgradeInfo = { id: 'tyres', name: 'Däck', blurb: 'Mindre hjulspinn, bättre bromsar' }
export const SUSPENSION: UpgradeInfo = { id: 'suspension', name: 'Fjädring', blurb: 'Mjukare landningar, välter inte lika lätt' }
export const DRIVETRAIN: UpgradeInfo = { id: 'drivetrain', name: 'Drivlina', blurb: 'Kraft till framhjulen också' }

const ALL: UpgradeId[] = ['engine', 'tyres', 'suspension', 'drivetrain', 'weight', 'flip']
const levelsAt = (n: number) => Object.fromEntries(ALL.map((id) => [id, n])) as Levels
export const BASE_LEVELS: Levels = levelsAt(1)
export const FULL_LEVELS: Levels = levelsAt(MAX_LEVEL)

/** Coins to buy the given level (2..MAX_LEVEL). About 50% more each level. */
export function price(level: number): number {
  return Math.round((300 * Math.pow(1.5, level - 2)) / 10) * 10
}

// Exact at both ends, so level 1 is the base spec and the top level the full spec.
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t

/**
 * The vehicle at the given upgrade levels: each value owned by an upgrade moves
 * from its base value (level 1) to its full value (MAX_LEVEL) in equal steps.
 * Pure data in, data out; no physics logic lives here.
 */
export function applyUpgrades(base: VehicleSpec, full: VehicleSpec, levels: Levels): VehicleSpec {
  const t = (id: UpgradeId) => (Math.min(MAX_LEVEL, Math.max(1, levels[id])) - 1) / (MAX_LEVEL - 1)
  const e = t('engine')
  const g = t('tyres')
  const s = t('suspension')
  const d = t('drivetrain')
  const w = t('weight')
  const f = t('flip')
  return {
    ...base,
    chassis: {
      ...base.chassis,
      mass: lerp(base.chassis.mass, full.chassis.mass, w),
      centerOfMass: {
        x: lerp(base.chassis.centerOfMass.x, full.chassis.centerOfMass.x, s),
        y: lerp(base.chassis.centerOfMass.y, full.chassis.centerOfMass.y, s),
      },
    },
    wheels: base.wheels.map((w, i) => ({
      ...w,
      friction: lerp(w.friction, full.wheels[i].friction, g),
      springHz: lerp(w.springHz, full.wheels[i].springHz, s),
      damping: lerp(w.damping, full.wheels[i].damping, s),
    })),
    engine: {
      ...base.engine,
      maxTorque: lerp(base.engine.maxTorque, full.engine.maxTorque, e),
      torqueFalloff: lerp(base.engine.torqueFalloff, full.engine.torqueFalloff, e),
      maxWheelSpeed: lerp(base.engine.maxWheelSpeed, full.engine.maxWheelSpeed, e),
      frontShare: lerp(base.engine.frontShare, full.engine.frontShare, d),
    },
    // Studded tyres (Marsh Rover): the Tyres upgrade raises the grip they never drop below.
    ...(base.amphibious ? { amphibious: { minGrip: lerp(base.amphibious.minGrip, full.amphibious?.minGrip ?? base.amphibious.minGrip, g) } } : {}),
    airControl: {
      ...base.airControl,
      spinRate: lerp(base.airControl.spinRate, full.airControl.spinRate, f),
      spinResponse: lerp(base.airControl.spinResponse, full.airControl.spinResponse, f),
    },
  }
}
