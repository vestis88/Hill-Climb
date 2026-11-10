import { MAX_LEVEL, price, UPGRADES, type Levels, type UpgradeId } from '../data/upgrades'
import type { RunStatus } from '../sim/run'

export interface GarageView {
  coins: number
  levels: Levels
  best: number
  tuning: boolean
  onBuy(id: UpgradeId): void
  onDrive(): void
  onTune(): void
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
  el.innerHTML = `
    <div class="bar"><h1>Ridgeline</h1><span class="coins">● ${v.coins}</span></div>
    <div class="cards">${UPGRADES.map(card).join('')}</div>
    <div class="best">Best distance: ${Math.floor(v.best)} m</div>
    <div class="actions">
      <button class="big" data-act="drive">Drive</button>
      ${v.tuning ? '<button class="small" data-act="tune">Tuning</button>' : ''}
    </div>`
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.buy) v.onBuy(b.dataset.buy as UpgradeId)
    else if (b.dataset.act === 'drive') v.onDrive()
    else if (b.dataset.act === 'tune') v.onTune()
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
