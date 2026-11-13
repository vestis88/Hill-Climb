import { MAX_LEVEL, type Levels, type UpgradeId, type UpgradeInfo } from '../data/upgrades'
import {
  BASE_LEVELS, FIELDS, FULL_LEVELS, hasFactors, isCustom, sandboxLevels, sandboxSpec, setAllLevels, setCustom, setLevel, upgradedOnly, withCustom,
  type Sandbox,
} from '../game/sandbox'
import { drawThumbs, ICONS } from './home'

/**
 * Trimning: the tuning sandbox's screen (game/sandbox.ts). Pick any vehicle and track, set its
 * upgrade levels with sliders and watch the handling values follow, or set the values by hand
 * ("Egen inställning"). "Alla fordon" scales a value on every vehicle at once. Test drives from
 * here never count.
 */

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

export interface TuningView {
  sandbox: Sandbox
  vehicles: { id: string; name: string; upgrades: UpgradeInfo[]; preview(c: HTMLCanvasElement): void }[]
  tracks: { id: string; name: string }[]
  modes: { id: string; name: string }[]
  /** The family's own upgrade levels for a vehicle ("Familjens" preset). */
  ownLevels(vehicleId: string): Levels
  /** Called after every change (to save it). */
  onChange(): void
  onDrive(): void
  onBack(): void
}

const fmt = (x: number, digits: number) => x.toFixed(digits).replace('.', ',')
const pct = (k: number) => `${Math.round(k * 100)} %`

export function showTuning(el: HTMLElement, v: TuningView): void {
  const s = v.sandbox
  let scope: 'vehicle' | 'all' = 'vehicle'
  const vehicle = () => v.vehicles.find((x) => x.id === s.vehicleId) ?? v.vehicles[0]
  const own = () => v.ownLevels(s.vehicleId)
  const levels = () => sandboxLevels(s, s.vehicleId, own())
  const same = (a: Levels, b: Levels, ids: UpgradeId[]) => ids.every((id) => a[id] === b[id])

  const status = () => {
    const custom = isCustom(s, s.vehicleId)
    const ids = vehicle().upgrades.map((u) => u.id)
    const l = levels()
    const preset = same(l, BASE_LEVELS, ids) ? 'Grund' : same(l, FULL_LEVELS, ids) ? 'Max' : same(l, own(), ids) ? 'Familjens nivåer' : 'Egna nivåer'
    return `<span class="pill ${custom ? 'custom' : ''}">${custom ? 'Egen inställning' : `Från uppgraderingar · ${preset}`}</span>
      ${hasFactors(s) ? '<span class="pill all">Alla fordon ändrade</span>' : ''}
      ${custom ? '<button class="small" data-act="uncustom">Tillbaka till uppgraderingarna</button>' : ''}`
  }

  const vehicleScope = () => {
    const veh = vehicle()
    const l = levels()
    const fromLevels = upgradedOnly(s, s.vehicleId, own())
    const mine = withCustom(s, s.vehicleId, own())
    const custom = s.custom[s.vehicleId] ?? {}
    const groups = [...new Set(FIELDS.map((f) => f.group))]
    return `
      <section class="tsec">
        <div class="tsec-head"><h3>Uppgraderingar</h3>
          <span class="seg"><button data-preset="base">Grund</button><button data-preset="own">Familjens</button><button data-preset="full">Max</button></span></div>
        <div class="tgrid">${veh.upgrades.map((u) => `
          <label class="tslider up">
            <span class="tl"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[u.id] ?? ''}</svg>${u.name}</span>
            <output data-out="lvl:${u.id}">${l[u.id]}/${MAX_LEVEL}</output>
            <input type="range" min="1" max="${MAX_LEVEL}" step="1" value="${l[u.id]}" data-level="${u.id}">
            <small>${u.blurb}</small>
          </label>`).join('')}</div>
      </section>
      <div class="tstatus" data-status>${status()}</div>
      ${groups.map((g) => `
        <section class="tsec">
          <div class="tsec-head"><h3>${g}</h3></div>
          <div class="tgrid">${FIELDS.filter((f) => f.group === g).map((f) => `
            <label class="tslider ${f.key in custom ? 'changed' : ''}" data-row="${f.key}">
              <span class="tl">${f.label}</span>
              <output data-out="f:${f.key}">${fmt(f.get(mine), f.digits)}</output>
              <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.get(mine)}" data-field="${f.key}">
              <small>${f.help} <span class="from" data-from="${f.key}">${f.key in custom ? `Uppgraderingarna ger ${fmt(f.get(fromLevels), f.digits)}.` : ''}</span></small>
            </label>`).join('')}</div>
        </section>`).join('')}`
  }

  const allScope = () => `
    <div class="hint">Ändringar här gäller <b>alla fordon</b>, i procent av varje fordons eget värde (100 % = oförändrat). De läggs ovanpå uppgraderingar och egna inställningar.</div>
    <div class="tstatus"><button class="small" data-act="unfactor" ${hasFactors(s) ? '' : 'disabled'}>Nollställ alla fordon</button></div>
    ${[...new Set(FIELDS.map((f) => f.group))].map((g) => `
      <section class="tsec">
        <div class="tsec-head"><h3>${g}</h3></div>
        <div class="tgrid">${FIELDS.filter((f) => f.group === g).map((f) => {
          const k = s.factors[f.key] ?? 1
          return `<label class="tslider ${k !== 1 ? 'changed' : ''}" data-row="${f.key}">
            <span class="tl">${f.label}</span>
            <output data-out="k:${f.key}">${pct(k)}</output>
            <input type="range" min="0.5" max="2" step="0.05" value="${k}" data-factor="${f.key}">
            <small>${f.help}</small>
          </label>`
        }).join('')}</div>
      </section>`).join('')}`

  const render = () => {
    const veh = vehicle()
    el.innerHTML = `
      <div class="bar menu-bar"><button class="small back" data-act="back">‹ Hem</button><h2>Trimning <span class="badge">RÄKNAS INTE</span></h2><button class="big" data-act="drive">Provkör</button></div>
      <div class="tpick">
        <div class="tveh-row">${v.vehicles.map((x) => `<button class="tveh ${x.id === s.vehicleId ? 'on' : ''}" data-vehicle="${x.id}" style="--c:#3fbf5f"><canvas data-thumb="tv:${x.id}"></canvas>${x.name}${isCustom(s, x.id) ? ' ✎' : ''}</button>`).join('')}</div>
        <div class="trow"><span class="label">Bana</span><span class="seg">${v.tracks.map((t) => `<button data-track="${t.id}" class="${t.id === s.envId ? 'on' : ''}">${t.name}</button>`).join('')}</span></div>
        <div class="trow"><span class="label">Läge</span><span class="seg">${v.modes.map((m) => `<button data-mode="${m.id}" class="${m.id === s.modeId ? 'on' : ''}">${m.name}</button>`).join('')}</span></div>
      </div>
      <div class="ttabs seg"><button data-scope="vehicle" class="${scope === 'vehicle' ? 'on' : ''}">${veh.name}</button><button data-scope="all" class="${scope === 'all' ? 'on' : ''}">Alla fordon</button></div>
      <div class="tbody">${scope === 'vehicle' ? vehicleScope() : allScope()}</div>
      <div class="actions">
        <button class="small" data-act="copy">Kopiera värden (JSON)</button>
        <button class="small" data-act="reset">Nollställ ${veh.name}</button>
      </div>
      <textarea class="hidden" readonly></textarea>`
    drawThumbs(el, Object.fromEntries(v.vehicles.map((x) => [`tv:${x.id}`, x.preview])))
  }

  /** Refresh every value on screen except the slider being dragged (re-drawing it would stop the drag). */
  const refresh = (active?: HTMLInputElement) => {
    if (scope !== 'vehicle') return
    const l = levels()
    const fromLevels = upgradedOnly(s, s.vehicleId, own())
    const mine = withCustom(s, s.vehicleId, own())
    const custom = s.custom[s.vehicleId] ?? {}
    for (const u of vehicle().upgrades) {
      const input = el.querySelector<HTMLInputElement>(`input[data-level="${u.id}"]`)
      if (input && input !== active) input.value = String(l[u.id])
      el.querySelector(`[data-out="lvl:${u.id}"]`)!.textContent = `${l[u.id]}/${MAX_LEVEL}`
    }
    for (const f of FIELDS) {
      const input = el.querySelector<HTMLInputElement>(`input[data-field="${f.key}"]`)
      if (input && input !== active) input.value = String(f.get(mine))
      el.querySelector(`[data-out="f:${f.key}"]`)!.textContent = fmt(f.get(mine), f.digits)
      el.querySelector(`[data-row="${f.key}"]`)?.classList.toggle('changed', f.key in custom)
      el.querySelector(`[data-from="${f.key}"]`)!.textContent = f.key in custom ? `Uppgraderingarna ger ${fmt(f.get(fromLevels), f.digits)}.` : ''
    }
    el.querySelector('[data-status]')!.innerHTML = status()
  }

  render()
  el.oninput = (e) => {
    const input = e.target as HTMLInputElement
    const x = Number(input.value)
    if (input.dataset.level) setLevel(s, s.vehicleId, input.dataset.level as UpgradeId, x, own())
    else if (input.dataset.field) setCustom(s, s.vehicleId, input.dataset.field, x, own())
    else if (input.dataset.factor) {
      s.factors = { ...s.factors, [input.dataset.factor]: x }
      el.querySelector(`[data-out="k:${input.dataset.factor}"]`)!.textContent = pct(x)
      el.querySelector(`[data-row="${input.dataset.factor}"]`)?.classList.toggle('changed', x !== 1)
      el.querySelector<HTMLButtonElement>('[data-act="unfactor"]')!.disabled = !hasFactors(s)
    } else return
    refresh(input)
    v.onChange()
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    const d = b.dataset
    if (d.vehicle) s.vehicleId = d.vehicle
    else if (d.track) s.envId = d.track
    else if (d.mode) s.modeId = d.mode
    else if (d.scope) scope = d.scope as 'vehicle' | 'all'
    else if (d.preset) setAllLevels(s, s.vehicleId, d.preset === 'base' ? BASE_LEVELS : d.preset === 'full' ? FULL_LEVELS : own())
    else if (d.act === 'uncustom') s.custom = { ...s.custom, [s.vehicleId]: {} }
    else if (d.act === 'unfactor') s.factors = {}
    else if (d.act === 'reset') {
      s.custom = { ...s.custom, [s.vehicleId]: {} }
      const { [s.vehicleId]: _, ...rest } = s.levels
      s.levels = rest
    } else if (d.act === 'drive') return v.onDrive()
    else if (d.act === 'back') return v.onBack()
    else if (d.act === 'copy') {
      const text = JSON.stringify(sandboxSpec(s, s.vehicleId, own()), null, 2)
      const area = el.querySelector('textarea')!
      area.value = text
      area.classList.remove('hidden')
      area.select()
      navigator.clipboard?.writeText(text).catch(() => undefined)
      return
    } else return
    v.onChange()
    // Keep the scroll position across the re-draw.
    const top = el.scrollTop
    render()
    el.scrollTop = top
  }
}
