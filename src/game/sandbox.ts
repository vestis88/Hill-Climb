import { VEHICLES, vehicleEntry } from '../data/vehicles'
import { applyUpgrades, BASE_LEVELS, FULL_LEVELS, MAX_LEVEL, type Levels } from '../data/upgrades'
import type { VehicleSpec } from '../sim/types'

/**
 * Trimning (the tuning sandbox, shown in test mode): drive any vehicle on any track with any
 * upgrade levels, and change its handling values freely. Runs from here never count: no coins,
 * records, highscores, ghosts, missions or stars (main.ts). The normal garage is untouched by it.
 *
 * A vehicle in the sandbox is built in three layers:
 * 1. its upgrade levels (sliders, level 1 to MAX_LEVEL): the same values a family would get;
 * 2. its own changes ("Egen inställning"): handling values set by hand, replacing what the
 *    levels give for that value only;
 * 3. changes for every vehicle ("Alla fordon"): a factor per value (×1 = unchanged).
 */
export interface Sandbox {
  vehicleId: string
  envId: string
  modeId: string
  /** Upgrade levels per vehicle. */
  levels: Record<string, Levels>
  /** Handling values set by hand per vehicle, by field key. */
  custom: Record<string, Record<string, number>>
  /** Factors on every vehicle's values, by field key (1 or absent: unchanged). */
  factors: Record<string, number>
}

export interface Field {
  key: string
  label: string
  /** What it does, in plain words, for the tuning screen. */
  help: string
  group: 'Motor' | 'Hjul och fjädring' | 'Kaross' | 'I luften'
  min: number
  max: number
  step: number
  /** Decimals to show. */
  digits: number
  get(v: VehicleSpec): number
  set(v: VehicleSpec, value: number): void
}

/**
 * A wheel value: read from the first wheel, and set on every wheel in proportion, so vehicles
 * with different front and back wheels (tractor, monster truck) keep the difference.
 */
const wheel = (key: 'friction' | 'springHz' | 'damping', f: Omit<Field, 'get' | 'set' | 'key'>): Field => ({
  ...f,
  key,
  get: (v) => v.wheels[0][key],
  set: (v, x) => {
    const k = v.wheels[0][key] ? x / v.wheels[0][key] : 1
    v.wheels = v.wheels.map((w, i) => ({ ...w, [key]: i === 0 ? x : w[key] * k }))
  },
})

export const FIELDS: Field[] = [
  {
    key: 'maxTorque', label: 'Vridmoment', group: 'Motor', min: 5, max: 80, step: 0.5, digits: 1,
    help: 'Motorns kraft. Mer tar dig uppför brantare backar och accelererar snabbare, men stegrar lättare.',
    get: (v) => v.engine.maxTorque, set: (v, x) => (v.engine = { ...v.engine, maxTorque: x }),
  },
  {
    key: 'maxWheelSpeed', label: 'Toppfart (hjulvarv)', group: 'Motor', min: 10, max: 80, step: 0.5, digits: 1,
    help: 'Hur fort hjulen som mest snurrar, alltså fordonets toppfart.',
    get: (v) => v.engine.maxWheelSpeed, set: (v, x) => (v.engine = { ...v.engine, maxWheelSpeed: x }),
  },
  {
    key: 'torqueFalloff', label: 'Kraftfall mot toppfart', group: 'Motor', min: 0, max: 0.95, step: 0.01, digits: 2,
    help: 'Hur mycket kraft som försvinner nära toppfarten. Lågt: drar hela vägen upp. Högt: segt i toppen.',
    get: (v) => v.engine.torqueFalloff, set: (v, x) => (v.engine = { ...v.engine, torqueFalloff: x }),
  },
  {
    key: 'frontShare', label: 'Fyrhjulsdrift', group: 'Motor', min: 0, max: 1, step: 0.01, digits: 2,
    help: 'Andel av kraften som går till framhjulen. 0 är bakhjulsdrift; mer klättrar bättre och stegrar mindre.',
    get: (v) => v.engine.frontShare, set: (v, x) => (v.engine = { ...v.engine, frontShare: x }),
  },
  {
    key: 'brakeTorque', label: 'Bromskraft', group: 'Motor', min: 5, max: 80, step: 0.5, digits: 1,
    help: 'Hur hårt bromsen tar. Mycket kan tippa fordonet framåt.',
    get: (v) => v.engine.brakeTorque, set: (v, x) => (v.engine = { ...v.engine, brakeTorque: x }),
  },
  wheel('friction', {
    label: 'Däckgrepp', group: 'Hjul och fjädring', min: 0.1, max: 2.5, step: 0.01, digits: 2,
    help: 'Hur bra däcken greppar. Lågt spinner och glider, högt biter i branta backar.',
  }),
  wheel('springHz', {
    label: 'Fjäderstyvhet', group: 'Hjul och fjädring', min: 1, max: 12, step: 0.1, digits: 1,
    help: 'Hur hård fjädringen är (svängningar per sekund). Mjuk sväljer gupp, hård studsar.',
  }),
  wheel('damping', {
    label: 'Dämpning', group: 'Hjul och fjädring', min: 0.05, max: 1.5, step: 0.01, digits: 2,
    help: 'Hur snabbt fjädringen slutar gunga. Lite dämpning studsar länge efter en landning.',
  }),
  {
    key: 'mass', label: 'Vikt (kaross)', group: 'Kaross', min: 2, max: 40, step: 0.5, digits: 1,
    help: 'Karossens vikt. Tyngre ligger stadigare men orkar mindre uppför.',
    get: (v) => v.chassis.mass, set: (v, x) => (v.chassis = { ...v.chassis, mass: x }),
  },
  {
    key: 'comY', label: 'Tyngdpunktens höjd', group: 'Kaross', min: -0.6, max: 0.6, step: 0.01, digits: 2,
    help: 'Var vikten sitter i höjdled. Lägre välter mindre, högre tippar lättare bakåt och framåt.',
    get: (v) => v.chassis.centerOfMass.y, set: (v, x) => (v.chassis = { ...v.chassis, centerOfMass: { ...v.chassis.centerOfMass, y: x } }),
  },
  {
    key: 'comX', label: 'Tyngdpunkt fram/bak', group: 'Kaross', min: -0.8, max: 0.8, step: 0.01, digits: 2,
    help: 'Var vikten sitter i längdled. Bakåt stegrar lättare, framåt dyker nosen.',
    get: (v) => v.chassis.centerOfMass.x, set: (v, x) => (v.chassis = { ...v.chassis, centerOfMass: { ...v.chassis.centerOfMass, x } }),
  },
  {
    key: 'spinRate', label: 'Rotationsfart i luften', group: 'I luften', min: 0.5, max: 7, step: 0.05, digits: 2,
    help: 'Hur fort du kan snurra i luften med pedalerna. Mer ger snabbare volter.',
    get: (v) => v.airControl.spinRate, set: (v, x) => (v.airControl = { ...v.airControl, spinRate: x }),
  },
  {
    key: 'spinResponse', label: 'Rotationssvar', group: 'I luften', min: 1, max: 40, step: 0.5, digits: 1,
    help: 'Hur snabbt snurren kommer igång och stannar. Högt känns direkt, lågt känns trögt.',
    get: (v) => v.airControl.spinResponse, set: (v, x) => (v.airControl = { ...v.airControl, spinResponse: x }),
  },
  {
    key: 'groundTorque', label: 'Pedaltippning på marken', group: 'I luften', min: 0, max: 40, step: 0.5, digits: 1,
    help: 'Hur mycket gas och broms tippar fordonet när hjulen är i marken.',
    get: (v) => v.airControl.groundTorque, set: (v, x) => (v.airControl = { ...v.airControl, groundTorque: x }),
  },
]

export const field = (key: string) => FIELDS.find((f) => f.key === key)

export function defaultSandbox(): Sandbox {
  return { vehicleId: VEHICLES[0].id, envId: 'meadow', modeId: 'endless', levels: {}, custom: {}, factors: {} }
}

/** A vehicle's sandbox upgrade levels (its own levels until changed here). */
export function sandboxLevels(s: Sandbox, vehicleId: string, own: Levels = BASE_LEVELS): Levels {
  return s.levels[vehicleId] ?? { ...own }
}

const copy = (v: VehicleSpec): VehicleSpec => structuredClone(v)

/** The vehicle from its upgrade levels only (what the parameter sliders start from). */
export function upgradedOnly(s: Sandbox, vehicleId: string, own?: Levels): VehicleSpec {
  const e = vehicleEntry(vehicleId)
  return copy(applyUpgrades(e.base, e.full, sandboxLevels(s, vehicleId, own)))
}

/** The vehicle with its own changes on top of its levels (before the all-vehicles factors). */
export function withCustom(s: Sandbox, vehicleId: string, own?: Levels): VehicleSpec {
  const v = upgradedOnly(s, vehicleId, own)
  for (const [key, value] of Object.entries(s.custom[vehicleId] ?? {})) field(key)?.set(v, value)
  return v
}

/** The vehicle as driven from the sandbox: levels, its own changes, then every-vehicle factors. */
export function sandboxSpec(s: Sandbox, vehicleId: string = s.vehicleId, own?: Levels): VehicleSpec {
  const v = withCustom(s, vehicleId, own)
  for (const [key, k] of Object.entries(s.factors)) {
    const f = field(key)
    if (f && k !== 1) f.set(v, f.get(v) * k)
  }
  return v
}

/** True when a vehicle has values set by hand, or any every-vehicle factor is in use. */
export const isCustom = (s: Sandbox, vehicleId: string) => Object.keys(s.custom[vehicleId] ?? {}).length > 0
export const hasFactors = (s: Sandbox) => Object.values(s.factors).some((k) => k !== 1)

/** Set a handling value by hand; setting it back to what the levels give drops the change. */
export function setCustom(s: Sandbox, vehicleId: string, key: string, value: number, own?: Levels): void {
  const f = field(key)!
  const fromLevels = f.get(upgradedOnly(s, vehicleId, own))
  const mine = { ...s.custom[vehicleId] }
  if (Math.abs(value - fromLevels) < f.step / 2) delete mine[key]
  else mine[key] = value
  s.custom = { ...s.custom, [vehicleId]: mine }
}

export function setLevel(s: Sandbox, vehicleId: string, id: keyof Levels, level: number, own?: Levels): void {
  s.levels = { ...s.levels, [vehicleId]: { ...sandboxLevels(s, vehicleId, own), [id]: Math.max(1, Math.min(MAX_LEVEL, level)) } }
}

export function setAllLevels(s: Sandbox, vehicleId: string, levels: Levels): void {
  s.levels = { ...s.levels, [vehicleId]: { ...levels } }
}

export { BASE_LEVELS, FULL_LEVELS }

const KEY = 'ridgeline.sandbox'

export function loadSandbox(): Sandbox {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = { ...defaultSandbox(), ...JSON.parse(raw) } as Sandbox
      if (!VEHICLES.some((v) => v.id === s.vehicleId)) s.vehicleId = VEHICLES[0].id
      return s
    }
  } catch {
    // fall through to defaults
  }
  return defaultSandbox()
}

export function saveSandbox(s: Sandbox): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // not persisted; still applies until reload
  }
}
