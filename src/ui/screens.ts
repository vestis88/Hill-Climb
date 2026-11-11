import { MAX_LEVEL, price, type Levels, type UpgradeId, type UpgradeInfo } from '../data/upgrades'

/** An environment or vehicle the player can pick, buy, or see locked. */
export interface Choice {
  id: string
  name: string
  blurb: string
  price: number
  owned: boolean
  selected: boolean
  /** Shown under the name, e.g. "Best 420 m". */
  note?: string
  /** Draws a small picture into the card. */
  preview?: (canvas: HTMLCanvasElement) => void
}
import type { RunStatus } from '../sim/run'

/** Small original icons for the upgrade cards (inline SVG, 24x24). */
const ICONS: Record<string, string> = {
  engine: '<rect x="5" y="9" width="14" height="10" rx="2" fill="#8b93a1"/><rect x="8" y="4" width="8" height="6" rx="1.5" fill="#c9ced6"/><rect x="2" y="12" width="3" height="4" rx="1" fill="#5b6372"/><rect x="19" y="12" width="3" height="4" rx="1" fill="#5b6372"/><circle cx="12" cy="14" r="2.2" fill="#ffb020"/>',
  tyres: '<circle cx="12" cy="12" r="9.5" fill="#2a2f38"/><circle cx="12" cy="12" r="5" fill="#c9ced6"/><circle cx="12" cy="12" r="1.8" fill="#5b6372"/><g fill="#5b6372"><rect x="11" y="1.5" width="2" height="3"/><rect x="11" y="19.5" width="2" height="3"/><rect x="1.5" y="11" width="3" height="2"/><rect x="19.5" y="11" width="3" height="2"/></g>',
  suspension: '<rect x="4" y="2" width="16" height="3" rx="1" fill="#8b93a1"/><rect x="4" y="19" width="16" height="3" rx="1" fill="#8b93a1"/><path d="M12 5 L17 7.5 L7 10 L17 12.5 L7 15 L17 17.5 L12 19" fill="none" stroke="#f2b632" stroke-width="2" stroke-linejoin="round"/>',
  drivetrain: '<circle cx="8" cy="12" r="5" fill="none" stroke="#c9ced6" stroke-width="3" stroke-dasharray="2.2 1.8"/><circle cx="17" cy="12" r="4" fill="none" stroke="#8b93a1" stroke-width="3" stroke-dasharray="2 1.6"/><circle cx="8" cy="12" r="1.6" fill="#c9ced6"/><circle cx="17" cy="12" r="1.3" fill="#8b93a1"/>',
  weight: '<path d="M5 19 C 7 9, 13 4, 20 3 C 18 10, 13 16, 5 19 Z" fill="#e8ecf2"/><path d="M5 19 L 15 9" stroke="#8b93a1" stroke-width="1.5"/>',
  flip: '<path d="M6 15 A 7 7 0 1 1 13 19" fill="none" stroke="#ffb020" stroke-width="2.6" stroke-linecap="round"/><path d="M2.5 12.5 L6 16.5 L9.5 12.5 Z" fill="#ffb020"/><circle cx="12" cy="12" r="2.4" fill="#c9ced6"/>',
}

export interface GarageView {
  coins: number
  vehicleName: string
  /** The selected vehicle's four upgrades. */
  upgrades: UpgradeInfo[]
  vehicles: Choice[]
  environments: Choice[]
  onPick(kind: 'vehicle' | 'env', id: string): void
  levels: Levels
  tuning: boolean
  /** Everything unlocked for testing; shown as a badge so it is never mistaken for real progress. */
  testMode?: boolean
  onBuy(id: UpgradeId): void
  onDrive(): void
  onTune(): void
  onSettings(): void
  /** The upgrade just bought, to play its card animation once. */
  justBought?: UpgradeId
}

let thumbObserver: ResizeObserver | undefined

export function showGarage(el: HTMLElement, v: GarageView): void {
  const card = (u: UpgradeInfo) => {
    const level = v.levels[u.id]
    const maxed = level >= MAX_LEVEL
    const cost = maxed ? 0 : price(level + 1)
    const bought = v.justBought === u.id
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''} ${bought && i === level - 1 ? 'new' : ''}"></i>`).join('')
    return `<div class="card ${bought ? 'bought' : ''}">
      <div class="name"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[u.id] ?? ''}</svg>${u.name}</div>
      <div class="pips">${pips}</div>
      <div class="blurb">${u.blurb}</div>
      <button class="buy" data-buy="${u.id}" ${maxed || cost > v.coins ? 'disabled' : ''}>${maxed ? 'Maxed' : `Upgrade ● ${cost}`}</button>
    </div>`
  }
  const choice = (kind: 'vehicle' | 'env', c: Choice) => `
    <button class="choice ${c.selected ? 'on' : ''} ${c.owned ? '' : 'locked'}" data-pick="${kind}:${c.id}"
      ${!c.owned && c.price > v.coins ? 'disabled' : ''}>
      ${c.preview ? `<canvas class="thumb ${kind}" data-thumb="${kind}:${c.id}"></canvas>` : ''}
      <span class="name">${c.name}</span>
      <span class="blurb">${c.owned ? (c.note ?? c.blurb) : c.blurb}</span>
      ${c.owned ? '' : `<span class="price">Unlock ● ${c.price}</span>`}
    </button>`
  el.innerHTML = `
    <div class="bar"><h1>Ridgeline${v.testMode ? ' <span class="badge">TEST MODE</span>' : ''}</h1><span class="coins">● ${v.coins}</span><button class="big" data-act="drive">Drive</button></div>
    <div class="choices">${v.vehicles.map((c) => choice('vehicle', c)).join('')}</div>
    <div class="label">${v.vehicleName} upgrades</div>
    <div class="cards">${v.upgrades.map(card).join('')}</div>
    <div class="choices">${v.environments.map((c) => choice('env', c)).join('')}</div>
    <div class="actions"><button class="small" data-act="settings">Settings</button>${v.tuning ? '<button class="small" data-act="tune">Tuning</button>' : ''}</div>`
  // Draw each preview at its card's real size, and again whenever that size changes (rotation,
  // browser bars, layout switching): a canvas drawn at one size and shown at another looks stretched.
  thumbObserver?.disconnect()
  thumbObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target as HTMLCanvasElement
      if (canvas.clientWidth && canvas.clientHeight) previews.get(canvas)?.(canvas)
    }
  })
  const previews = new Map<HTMLCanvasElement, (c: HTMLCanvasElement) => void>()
  for (const c of [...v.vehicles.map((x) => ['vehicle', x] as const), ...v.environments.map((x) => ['env', x] as const)]) {
    const canvas = el.querySelector<HTMLCanvasElement>(`canvas[data-thumb="${c[0]}:${c[1].id}"]`)
    if (canvas && c[1].preview) {
      previews.set(canvas, c[1].preview)
      thumbObserver.observe(canvas)
    }
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.buy) v.onBuy(b.dataset.buy as UpgradeId)
    else if (b.dataset.pick) {
      const [kind, id] = b.dataset.pick.split(':')
      v.onPick(kind as 'vehicle' | 'env', id)
    }
    else if (b.dataset.act === 'drive') v.onDrive()
    else if (b.dataset.act === 'tune') v.onTune()
    else if (b.dataset.act === 'settings') v.onSettings()
  }
}

export interface ResultsView {
  status: RunStatus | 'ended'
  distance: number
  newBest: boolean
  coins: { track: number; air: number; flips: number; wheelies: number; milestones: number; rescue: number }
  total: number
  bank: number
  onGarage(): void
  onAgain(): void
}

const TITLES = { crashed: 'Crashed!', outOfFuel: 'Out of fuel', ended: 'Run ended', running: 'Run ended' }

export function showResults(el: HTMLElement, v: ResultsView): void {
  const row = (label: string, value: number) => (value ? `<div><span>${label}</span><span><b class="coin">●</b> ${value}</span></div>` : '')
  el.innerHTML = `
    <h2>${TITLES[v.status]}</h2>
    <div class="results-total"><b class="coin">●</b> <span data-count="${v.total}">0</span></div>
    <div>${Math.floor(v.distance)} m ${v.newBest ? '<span class="newbest">New best!</span>' : ''}</div>
    <div class="rows">
      ${row('Coins on the track', v.coins.track)}
      ${row('Air time', v.coins.air)}
      ${row('Flips', v.coins.flips)}
      ${row('Wheelies', v.coins.wheelies)}
      ${row('Distance bonus', v.coins.milestones)}
      ${row('Fuel on empty', v.coins.rescue)}
      <div class="total"><span>This run</span><span><b class="coin">●</b> <span data-count="${v.total}">0</span></span></div>
      <div><span>You have</span><span><b class="coin">●</b> ${v.bank}</span></div>
    </div>
    <div class="actions">
      <button class="big" data-act="garage">Garage</button>
      <button class="big blue" data-act="again">Drive again</button>
    </div>`
  countUp(el)
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.act === 'garage') v.onGarage()
    else if (b?.dataset.act === 'again') v.onAgain()
  }
}

/** Numbers marked data-count tick up from 0 to their value over about a second. */
function countUp(el: HTMLElement): void {
  const spans = [...el.querySelectorAll<HTMLElement>('[data-count]')]
  const start = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 1000)
    const e = 1 - (1 - t) ** 3
    for (const s of spans) s.textContent = String(Math.round(Number(s.dataset.count) * e))
    if (t < 1 && el.isConnected) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
