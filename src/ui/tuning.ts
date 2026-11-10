import { runabout, runaboutFull } from '../data/vehicles'
import type { VehicleSpec } from '../sim/types'

/**
 * Tuning sandbox (task P2): sliders for the handling values of the base car and the
 * fully upgraded car. Only shown when the page address ends in ?tune, so players never see it.
 * Changes are kept in this browser; "Copy values" gives JSON to paste into data/vehicles.ts.
 */
export interface Tuning {
  base: VehicleSpec
  full: VehicleSpec
}

export type DriveAs = 'mine' | 'base' | 'full'

const KEY = 'ridgeline.tuning'

export const tuningEnabled = () => new URLSearchParams(location.search).has('tune')

export function defaultTuning(): Tuning {
  return { base: structuredClone(runabout), full: structuredClone(runaboutFull) }
}

export function loadTuning(): Tuning {
  if (!tuningEnabled()) return defaultTuning()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaultTuning(), ...JSON.parse(raw) }
  } catch {
    // fall through to defaults
  }
  return defaultTuning()
}

function saveTuning(t: Tuning): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    // not persisted; still applies until reload
  }
}

interface Field {
  label: string
  min: number
  max: number
  step: number
  get(v: VehicleSpec): number
  set(v: VehicleSpec, value: number): void
}

const eng = (key: keyof VehicleSpec['engine'], label: string, min: number, max: number, step: number): Field => ({
  label, min, max, step,
  get: (v) => v.engine[key],
  set: (v, x) => (v.engine[key] = x),
})
const air = (key: keyof VehicleSpec['airControl'], label: string, min: number, max: number, step: number): Field => ({
  label, min, max, step,
  get: (v) => v.airControl[key],
  set: (v, x) => (v.airControl[key] = x),
})
const wheel = (key: 'friction' | 'springHz' | 'damping', label: string, min: number, max: number, step: number): Field => ({
  label, min, max, step,
  get: (v) => v.wheels[0][key],
  set: (v, x) => v.wheels.forEach((w) => (w[key] = x)),
})

const FIELDS: Field[] = [
  eng('maxTorque', 'Engine torque', 5, 60, 0.5),
  eng('maxWheelSpeed', 'Top wheel speed (rad/s)', 10, 70, 0.5),
  eng('torqueFalloff', 'Torque falloff at top speed', 0, 0.9, 0.01),
  eng('frontShare', 'Front drive share', 0, 1, 0.01),
  eng('brakeTorque', 'Brake torque', 5, 60, 0.5),
  wheel('friction', 'Tyre grip', 0.1, 2, 0.01),
  wheel('springHz', 'Spring stiffness (Hz)', 1, 10, 0.1),
  wheel('damping', 'Spring damping', 0.05, 1.2, 0.01),
  { label: 'Chassis mass', min: 3, max: 30, step: 0.5, get: (v) => v.chassis.mass, set: (v, x) => (v.chassis.mass = x) },
  {
    label: 'Centre of weight height', min: -0.5, max: 0.5, step: 0.01,
    get: (v) => v.chassis.centerOfMass.y,
    set: (v, x) => (v.chassis.centerOfMass = { ...v.chassis.centerOfMass, y: x }),
  },
  air('spinRate', 'Air spin rate (rad/s)', 0.5, 6, 0.05),
  air('spinResponse', 'Air spin response', 1, 40, 0.5),
  air('groundTorque', 'Pedal pitch on ground', 0, 30, 0.5),
]

/** Build the tuning panel into el. onDrive starts a run with the chosen car. */
export function showTuning(el: HTMLElement, tuning: Tuning, driveAs: DriveAs, onDrive: (driveAs: DriveAs) => void, onBack: () => void): void {
  let editing: 'base' | 'full' = driveAs === 'full' ? 'full' : 'base'
  let drive = driveAs

  const render = () => {
    const spec = tuning[editing]
    el.innerHTML = `
      <div class="bar"><h2>Tuning</h2><button class="small" data-act="back">Back</button></div>
      <div class="bar">
        <span>Edit: <span class="seg"><button data-edit="base" class="${editing === 'base' ? 'on' : ''}">Base car</button><button data-edit="full" class="${editing === 'full' ? 'on' : ''}">Fully upgraded</button></span></span>
        <span>Drive as: <span class="seg"><button data-drive="mine" class="${drive === 'mine' ? 'on' : ''}">My upgrades</button><button data-drive="base" class="${drive === 'base' ? 'on' : ''}">Base</button><button data-drive="full" class="${drive === 'full' ? 'on' : ''}">Full</button></span></span>
      </div>
      <div class="sliders">${FIELDS.map((f, i) => `
        <label>${f.label}<output id="out${i}">${f.get(spec)}</output>
          <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.get(spec)}" data-field="${i}">
        </label>`).join('')}
      </div>
      <div class="actions">
        <button class="big" data-act="drive">Drive</button>
        <button class="small" data-act="copy">Copy values</button>
        <button class="small" data-act="reset">Reset to defaults</button>
      </div>
      <textarea class="hidden" readonly></textarea>`
  }
  render()

  el.oninput = (e) => {
    const input = e.target as HTMLInputElement
    const i = Number(input.dataset.field)
    if (Number.isNaN(i)) return
    FIELDS[i].set(tuning[editing], Number(input.value))
    el.querySelector(`#out${i}`)!.textContent = input.value
    saveTuning(tuning)
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b) return
    if (b.dataset.edit) {
      editing = b.dataset.edit as 'base' | 'full'
      render()
    } else if (b.dataset.drive) {
      drive = b.dataset.drive as DriveAs
      render()
    } else if (b.dataset.act === 'drive') onDrive(drive)
    else if (b.dataset.act === 'back') onBack()
    else if (b.dataset.act === 'reset') {
      Object.assign(tuning, defaultTuning())
      saveTuning(tuning)
      render()
    } else if (b.dataset.act === 'copy') {
      const text = JSON.stringify({ base: tuning.base, full: tuning.full }, null, 2)
      const area = el.querySelector('textarea')!
      area.value = text
      area.classList.remove('hidden')
      area.select()
      navigator.clipboard?.writeText(text).catch(() => undefined)
    }
  }
}
