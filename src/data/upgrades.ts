import type { VehicleSpec } from '../sim/types'

/** See README "Upgrades". Each upgrade owns a fixed set of physics values. */
export type UpgradeId = 'engine' | 'tyres' | 'suspension' | 'drivetrain'
export type Levels = Record<UpgradeId, number>

export const MAX_LEVEL = 10

export const UPGRADES: { id: UpgradeId; name: string; blurb: string }[] = [
  { id: 'engine', name: 'Engine', blurb: 'Faster and stronger on hills' },
  { id: 'tyres', name: 'Tyres', blurb: 'Less wheelspin, better braking' },
  { id: 'suspension', name: 'Suspension', blurb: 'Cleaner landings, harder to tip' },
  { id: 'drivetrain', name: 'Drivetrain', blurb: 'Power to the front wheels too' },
]

export const BASE_LEVELS: Levels = { engine: 1, tyres: 1, suspension: 1, drivetrain: 1 }
export const FULL_LEVELS: Levels = { engine: MAX_LEVEL, tyres: MAX_LEVEL, suspension: MAX_LEVEL, drivetrain: MAX_LEVEL }

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
  return {
    ...base,
    chassis: {
      ...base.chassis,
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
  }
}
