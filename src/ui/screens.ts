import { MAX_LEVEL, price, UPGRADES, type Levels, type UpgradeId } from '../data/upgrades'

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

export interface GarageView {
  coins: number
  vehicleName: string
  vehicles: Choice[]
  environments: Choice[]
  onPick(kind: 'vehicle' | 'env', id: string): void
  levels: Levels
  tuning: boolean
  onBuy(id: UpgradeId): void
  onDrive(): void
  onTune(): void
  onSettings(): void
}

export function showGarage(el: HTMLElement, v: GarageView): void {
  const card = (u: (typeof UPGRADES)[number]) => {
    const level = v.levels[u.id]
    const maxed = level >= MAX_LEVEL
    const cost = maxed ? 0 : price(level + 1)
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')
    return `<div class="card">
      <div class="name">${u.name}</div>
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
    <div class="bar"><h1>Ridgeline</h1><span class="coins">● ${v.coins}</span><button class="big" data-act="drive">Drive</button></div>
    <div class="choices">${v.vehicles.map((c) => choice('vehicle', c)).join('')}</div>
    <div class="label">${v.vehicleName} upgrades</div>
    <div class="cards">${UPGRADES.map(card).join('')}</div>
    <div class="choices">${v.environments.map((c) => choice('env', c)).join('')}</div>
    <div class="actions"><button class="small" data-act="settings">Settings</button>${v.tuning ? '<button class="small" data-act="tune">Tuning</button>' : ''}</div>`
  // Draw the previews once the garage is laid out on screen (canvases have no size while hidden).
  requestAnimationFrame(() => {
    for (const c of [...v.vehicles.map((x) => ['vehicle', x] as const), ...v.environments.map((x) => ['env', x] as const)]) {
      const canvas = el.querySelector<HTMLCanvasElement>(`canvas[data-thumb="${c[0]}:${c[1].id}"]`)
      if (canvas && c[1].preview) c[1].preview(canvas)
    }
  })
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
  coins: { track: number; air: number; flips: number; milestones: number }
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
    <div>${Math.floor(v.distance)} m ${v.newBest ? '<span class="newbest">New best!</span>' : ''}</div>
    <div class="rows">
      ${row('Coins on the track', v.coins.track)}
      ${row('Air time', v.coins.air)}
      ${row('Flips', v.coins.flips)}
      ${row('Distance bonus', v.coins.milestones)}
      <div class="total"><span>This run</span><span><b class="coin">●</b> ${v.total}</span></div>
      <div><span>You have</span><span><b class="coin">●</b> ${v.bank}</span></div>
    </div>
    <div class="actions">
      <button class="big" data-act="garage">Garage</button>
      <button class="big" data-act="again" style="background:#2f80ed">Drive again</button>
    </div>`
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.act === 'garage') v.onGarage()
    else if (b?.dataset.act === 'again') v.onAgain()
  }
}
