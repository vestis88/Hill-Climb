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

const TEST_KEY = 'ridgeline.testmode'

/** Test mode: on with ?tune in the address, or with the switch in Settings (kept in this browser). */
export function tuningEnabled(): boolean {
  if (new URLSearchParams(location.search).has('tune')) return true
  try {
    return localStorage.getItem(TEST_KEY) === '1'
  } catch {
    return false
  }
}

export function setTestMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(TEST_KEY, '1')
    else localStorage.removeItem(TEST_KEY)
  } catch {
    // not persisted
  }
}

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

const eng = (key: Exclude<keyof VehicleSpec['engine'], 'gearbox'>, label: string, min: number, max: number, step: number): Field => ({
  label, min, max, step,
  get: (v) => v.engine[key],
  set: (v, x) => (v.engine[key] = x),
})
const air = (key: 'spinRate' | 'spinResponse' | 'groundTorque', label: string, min: number, max: number, step: number): Field => ({
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
  eng('maxTorque', 'Motorns vridmoment', 5, 60, 0.5),
  eng('maxWheelSpeed', 'Högsta hjulvarv (rad/s)', 10, 70, 0.5),
  eng('torqueFalloff', 'Vridmomentsfall vid toppfart', 0, 0.9, 0.01),
  eng('frontShare', 'Andel drivning fram', 0, 1, 0.01),
  eng('brakeTorque', 'Bromsmoment', 5, 60, 0.5),
  wheel('friction', 'Däckgrepp', 0.1, 2, 0.01),
  wheel('springHz', 'Fjäderstyvhet (Hz)', 1, 10, 0.1),
  wheel('damping', 'Fjäderdämpning', 0.05, 1.2, 0.01),
  { label: 'Chassits massa', min: 3, max: 30, step: 0.5, get: (v) => v.chassis.mass, set: (v, x) => (v.chassis.mass = x) },
  {
    label: 'Tyngdpunktens höjd', min: -0.5, max: 0.5, step: 0.01,
    get: (v) => v.chassis.centerOfMass.y,
    set: (v, x) => (v.chassis.centerOfMass = { ...v.chassis.centerOfMass, y: x }),
  },
  air('spinRate', 'Snurrfart i luften (rad/s)', 0.5, 6, 0.05),
  air('spinResponse', 'Snurrsvar i luften', 1, 40, 0.5),
  air('groundTorque', 'Pedaltippning på marken', 0, 30, 0.5),
]

/** Build the tuning panel into el. onDrive starts a run with the chosen car. */
export function showTuning(el: HTMLElement, tuning: Tuning, driveAs: DriveAs, onDrive: (driveAs: DriveAs) => void, onBack: () => void): void {
  let editing: 'base' | 'full' = driveAs === 'full' ? 'full' : 'base'
  let drive = driveAs

  const render = () => {
    const spec = tuning[editing]
    el.innerHTML = `
      <div class="bar"><h2>Trimning</h2><button class="small" data-act="back">Tillbaka</button></div>
      <div class="bar">
        <span>Redigera: <span class="seg"><button data-edit="base" class="${editing === 'base' ? 'on' : ''}">Grundbil</button><button data-edit="full" class="${editing === 'full' ? 'on' : ''}">Fullt uppgraderad</button></span></span>
        <span>Kör som: <span class="seg"><button data-drive="mine" class="${drive === 'mine' ? 'on' : ''}">Mina uppgraderingar</button><button data-drive="base" class="${drive === 'base' ? 'on' : ''}">Grund</button><button data-drive="full" class="${drive === 'full' ? 'on' : ''}">Full</button></span></span>
      </div>
      <div class="sliders">${FIELDS.map((f, i) => `
        <label>${f.label}<output id="out${i}">${f.get(spec)}</output>
          <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.get(spec)}" data-field="${i}">
        </label>`).join('')}
      </div>
      <div class="actions">
        <button class="big" data-act="drive">Kör</button>
        <button class="small" data-act="copy">Kopiera värden</button>
        <button class="small" data-act="reset">Återställ standard</button>
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
