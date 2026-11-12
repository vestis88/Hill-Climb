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
import { formatTime } from '../data/modes'
import { genitive } from '../data/players'

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
  /** Missions of the ticked players: three each, with their rewards. */
  missions: { name: string; colour: string; items: { text: string; reward: number }[] }[]
  /** Who can play, and who is ticked for the next round. */
  players: { name: string; colour: string; on: boolean }[]
  onTogglePlayer(name: string): void
  /** Endless or a race length; races are timed to a finish line. */
  modes: { id: string; name: string; on: boolean }[]
  onMode(id: string): void
  /** Today's challenge: a 500 m race and an endless run, each with a set vehicle and tuning. */
  daily: { id: 'race' | 'endless'; name: string; blurb: string; note: string; on: boolean; preview: (c: HTMLCanvasElement) => void }[]
  dailyTitle: string
  onDaily(id: 'race' | 'endless'): void
  onScores(): void
  /** Start a tournament: three tracks, points per placing (needs two or more players). */
  onCup(): void
  onOutfit(): void
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
      <button class="buy" data-buy="${u.id}" ${maxed || cost > v.coins ? 'disabled' : ''}>${maxed ? 'Max' : `Uppgradera ● ${cost}`}</button>
    </div>`
  }
  const choice = (kind: 'vehicle' | 'env', c: Choice) => `
    <button class="choice ${c.selected ? 'on' : ''} ${c.owned ? '' : 'locked'}" data-pick="${kind}:${c.id}"
      ${!c.owned && c.price > v.coins ? 'disabled' : ''}>
      ${c.preview ? `<canvas class="thumb ${kind}" data-thumb="${kind}:${c.id}"></canvas>` : ''}
      <span class="name">${c.name}</span>
      <span class="blurb">${c.owned ? (c.note ?? c.blurb) : c.blurb}</span>
      ${c.owned ? '' : `<span class="price">Lås upp ● ${c.price}</span>`}
    </button>`
  el.innerHTML = `
    <div class="bar"><h1>Ridgeline${v.testMode ? ' <span class="badge">TESTLÄGE</span>' : ''}</h1>
      <div class="players" role="group" aria-label="Vem spelar">${v.players.map((p) => `<button class="player ${p.on ? 'on' : ''}" data-player="${p.name}" style="--c:${p.colour}" aria-pressed="${p.on}"><span class="tick">${p.on ? '✓' : ''}</span>${p.name}</button>`).join('')}</div>
      <span class="coins">● ${v.coins}</span><button class="big" data-act="drive" ${v.players.some((p) => p.on) ? '' : 'disabled'}>Kör</button></div>
    <div class="choices vehicles">${v.vehicles.map((c) => choice('vehicle', c)).join('')}</div>
    <div class="label">Uppgraderingar för ${v.vehicleName}</div>
    <div class="cards">${v.upgrades.map(card).join('')}</div>
    <div class="modebar"><span class="label">Läge</span><div class="seg">${v.modes.map((m) => `<button class="${m.on ? 'on' : ''}" data-mode="${m.id}">${m.name}</button>`).join('')}</div></div>
    <div class="label daily-label">${v.dailyTitle}</div>
    <div class="choices daily">${v.daily.map((d) => `<button class="choice ${d.on ? 'on' : ''}" data-daily="${d.id}">
      <canvas class="thumb vehicle" data-thumb="daily:${d.id}"></canvas>
      <span class="name">${d.name}</span><span class="blurb">${d.blurb}</span><span class="note">${d.note}</span></button>`).join('')}</div>
    ${v.missions.length ? `<div class="label">Uppdrag</div><div class="missions">${v.missions.map((p) => `<div class="mrow" style="--c:${p.colour}"><b class="pname">${p.name}</b>${p.items.map((m) => `<span class="mission">${m.text} <b class="coin">●</b> ${m.reward}</span>`).join('')}</div>`).join('')}</div>` : ''}
    <div class="choices envs">${v.environments.map((c) => choice('env', c)).join('')}</div>
    <div class="actions"><button class="small go" data-act="cup" ${v.players.filter((p) => p.on).length >= 2 ? '' : 'disabled'}>🏆 Tävling: 3 banor</button><button class="small" data-act="outfit">Utstyrsel</button><button class="small" data-act="scores">Topplista</button><button class="small" data-act="settings">Inställningar</button>${v.tuning ? '<button class="small" data-act="tune">Trimning</button>' : ''}</div>`
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
  for (const c of [...v.vehicles.map((x) => ['vehicle', x] as const), ...v.environments.map((x) => ['env', x] as const), ...v.daily.map((x) => ['daily', x] as const)]) {
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
    else if (b.dataset.player) v.onTogglePlayer(b.dataset.player)
    else if (b.dataset.mode) v.onMode(b.dataset.mode)
    else if (b.dataset.daily) v.onDaily(b.dataset.daily as 'race' | 'endless')
    else if (b.dataset.act === 'scores') v.onScores()
    else if (b.dataset.act === 'cup') v.onCup()
    else if (b.dataset.act === 'outfit') v.onOutfit()
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
  /** Races: the length, and the finish time (absent when the run did not finish). */
  race?: { length: number; time?: number; newBestTime: boolean }
  coins: { track: number; air: number; flips: number; wheelies: number; milestones: number; rescue: number; combos: number }
  total: number
  bank: number
  /** Whose run it was, in a round. */
  player: { name: string; colour: string }
  /** Missions this run completed, with their rewards. */
  missions?: { text: string; reward: number }[]
  /** The next player in the round, or nothing after the last turn. */
  next?: string
  /** True after the last turn of a round with several players: show the standings next. */
  roundOver: boolean
  onGarage(): void
  onAgain(): void
  onNext(): void
  onStandings(): void
}

/** Green buttons always drive; blue ones go elsewhere (garage, results, back). */
const TITLES = { crashed: 'Krasch!', outOfFuel: 'Slut på bränsle', ended: 'Åket avslutat', running: 'Åket avslutat', finished: 'I mål!' }

export function showResults(el: HTMLElement, v: ResultsView): void {
  const row = (label: string, value: number) => (value ? `<div><span>${label}</span><span><b class="coin">●</b> ${value}</span></div>` : '')
  const actions = v.next
    ? `<button class="big" data-act="next">${genitive(v.next)} tur</button>`
    : v.roundOver
      ? '<button class="big blue" data-act="standings">Omgångens resultat</button>'
      : '<button class="big blue" data-act="garage">Garaget</button><button class="big" data-act="again">Kör igen</button>'
  el.innerHTML = `
    <div class="who" style="--c:${v.player.colour}">${v.player.name}</div>
    <h2>${TITLES[v.status]}</h2>
    <div class="results-total"><b class="coin">●</b> <span data-count="${v.total}">0</span></div>
    ${v.race
      ? v.race.time !== undefined
        ? `<div class="racetime">${formatTime(v.race.time)} ${v.race.newBestTime ? '<span class="newbest">Nytt rekord!</span>' : ''}</div>`
        : `<div>Kom inte i mål: ${Math.floor(v.distance)} av ${v.race.length} m</div>`
      : `<div>${Math.floor(v.distance)} m ${v.newBest ? '<span class="newbest">Nytt rekord!</span>' : ''}</div>`}
    ${v.missions?.length ? `<div class="missions-done">${v.missions.map((m) => `<span>✓ Uppdrag klart: ${m.text} <b class="coin">●</b> ${m.reward}</span>`).join('')}</div>` : ''}
    <div class="rows">
      ${row('Mynt på banan', v.coins.track)}
      ${row('Lufttid', v.coins.air)}
      ${row('Volter', v.coins.flips)}
      ${row('Stegringar', v.coins.wheelies)}
      ${row('Kombo', v.coins.combos)}
      ${row('Distansbonus', v.coins.milestones)}
      ${row('Bränsle på tom tank', v.coins.rescue)}
      <div class="total"><span>Det här åket</span><span><b class="coin">●</b> <span data-count="${v.total}">0</span></span></div>
      <div><span>Du har</span><span><b class="coin">●</b> ${v.bank}</span></div>
    </div>
    <div class="actions">${actions}</div>`
  countUp(el)
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.act === 'garage') v.onGarage()
    else if (b?.dataset.act === 'again') v.onAgain()
    else if (b?.dataset.act === 'next') v.onNext()
    else if (b?.dataset.act === 'standings') v.onStandings()
  }
}

export interface TurnView {
  /** The round's players in turn order, and whose turn it is now. */
  players: { name: string; colour: string }[]
  turn: number
  /** Track and mode, for the round. */
  info: string
  /** The vehicles this player can pick (the ones the family owns), with theirs selected. */
  vehicles: { id: string; name: string; selected: boolean; preview: (c: HTMLCanvasElement) => void }[]
  onVehicle(id: string): void
  onGo(): void
}

/** Before each turn of a round with several players: whose turn, the order, and their vehicle. */
export function showTurn(el: HTMLElement, v: TurnView): void {
  const p = v.players[v.turn]
  const first = v.turn === 0
  el.innerHTML = `
    <h2>${first ? 'Ny omgång' : 'Nästa tur'}</h2>
    <div class="best">${v.info}</div>
    <div class="who big-who" style="--c:${p.colour}">${first ? `${p.name} börjar!` : `${genitive(p.name)} tur!`}</div>
    <div class="order">${v.players.map((q, i) => `${i ? '<span class="arrow">→</span>' : ''}<span class="pchip ${i === v.turn ? 'on' : ''} ${i < v.turn ? 'done' : ''}" style="--c:${q.colour}"><b>${i + 1}</b> ${q.name}</span>`).join('')}</div>
    <div class="turn-vehicles" style="--c:${p.colour}">${v.vehicles.map((x) => `<button class="tveh ${x.selected ? 'on' : ''}" data-veh="${x.id}"><canvas data-tthumb="${x.id}"></canvas><span>${x.name}</span></button>`).join('')}</div>
    <div class="actions">
      <button class="big" data-act="go">Kör, ${p.name}!</button>
    </div>`
  for (const x of v.vehicles) {
    const c = el.querySelector<HTMLCanvasElement>(`canvas[data-tthumb="${x.id}"]`)
    if (c) requestAnimationFrame(() => c.clientWidth && x.preview(c))
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.veh) v.onVehicle(b.dataset.veh)
    else if (b?.dataset.act === 'go') v.onGo()
  }
}

export interface OutfitView {
  coins: number
  players: { name: string; colour: string; on: boolean }[]
  /** Pip in the chosen player's outfit. */
  preview: (canvas: HTMLCanvasElement) => void
  hats: { id: string; name: string; price: number; owned: boolean; on: boolean }[]
  patterns: { id: string; name: string; price: number; owned: boolean; on: boolean }[]
  onPlayer(name: string): void
  /** Wear an item, buying it first if it is not owned and affordable. */
  onItem(kind: 'hat' | 'pattern', id: string): void
  onBack(): void
}

/** Utstyrsel: each player's helmet pattern and hat, bought once for the family. */
export function showOutfit(el: HTMLElement, v: OutfitView): void {
  const item = (kind: 'hat' | 'pattern', x: OutfitView['hats'][number]) =>
    `<button class="choice ${x.on ? 'on' : ''} ${x.owned ? '' : 'locked'}" data-item="${kind}:${x.id}" ${!x.owned && x.price > v.coins ? 'disabled' : ''}>
      <span class="name">${x.name}</span>${x.owned ? '' : `<span class="price">Köp ● ${x.price}</span>`}</button>`
  el.innerHTML = `
    <div class="bar"><h2>Utstyrsel</h2><span class="coins">● ${v.coins}</span><button class="small" data-act="back">Tillbaka</button></div>
    <div class="players">${v.players.map((p) => `<button class="player ${p.on ? 'on' : ''}" data-player="${p.name}" style="--c:${p.colour}"><span class="tick">${p.on ? '✓' : ''}</span>${p.name}</button>`).join('')}</div>
    <canvas class="pip" width="360" height="300"></canvas>
    <div class="label">Hatt</div><div class="choices outfit">${v.hats.map((x) => item('hat', x)).join('')}</div>
    <div class="label">Mönster på hjälmen</div><div class="choices outfit">${v.patterns.map((x) => item('pattern', x)).join('')}</div>`
  const c = el.querySelector<HTMLCanvasElement>('canvas.pip')
  if (c) v.preview(c)
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.player) v.onPlayer(b.dataset.player)
    else if (b.dataset.item) {
      const [kind, id] = b.dataset.item.split(':')
      v.onItem(kind as 'hat' | 'pattern', id)
    } else if (b.dataset.act === 'back') v.onBack()
  }
}

export interface StandingsView {
  track: string
  /** Furthest (endless) or fastest (race) first, with the result already written out. */
  rows: { name: string; colour: string; vehicle: string; result: string; newBest: boolean }[]
  /** In a tournament: which track this was, the points so far, and the winners after the last. */
  cup?: { title: string; table: { name: string; colour: string; points: number }[]; nextTrack?: string; winners?: string[] }
  onHome(): void
  onAgain(): void
  onNextTrack?(): void
}

/** After the last turn: who got furthest this round. */
export function showStandings(el: HTMLElement, v: StandingsView): void {
  const medal = ['🥇', '🥈', '🥉']
  const cup = v.cup
  const table = cup ? `<div class="cup-table">${cup.table.map((t, i) => `<span style="--c:${t.colour}" class="${i === 0 ? 'lead' : ''}"><b class="pname">${t.name}</b> ${t.points} p</span>`).join('')}</div>` : ''
  const actions = cup && cup.nextTrack
    ? `<button class="big" data-act="next">Nästa bana: ${cup.nextTrack}</button>`
    : cup
      ? '<button class="big blue" data-act="home">Garaget</button><button class="big" data-act="again">Ny tävling</button>'
      : '<button class="big blue" data-act="home">Garaget</button><button class="big" data-act="again">Spela igen</button>'
  el.innerHTML = `
    ${cup?.winners ? `<div class="trophy">🏆</div><div class="who big-who" style="--c:${cup.table[0].colour}">${cup.winners.join(' och ')} ${cup.winners.length > 1 ? 'vinner' : 'vinner'} tävlingen!</div>` : `<h2>${cup ? cup.title : 'Omgångens resultat'}</h2>`}
    <div class="best">${v.track}</div>
    <div class="rows standings">${v.rows.map((r, i) => `<div style="--c:${r.colour}"><span>${medal[i] ?? ''} <b class="pname">${r.name}</b> <small class="veh">${r.vehicle}</small></span><span>${r.result} ${r.newBest ? '<span class="newbest">Nytt rekord!</span>' : ''}</span></div>`).join('')}</div>
    ${table}
    <div class="actions">${actions}</div>`
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.act === 'home') v.onHome()
    else if (b?.dataset.act === 'again') v.onAgain()
    else if (b?.dataset.act === 'next') v.onNextTrack?.()
  }
}

export interface ScoresView {
  tracks: { id: string; name: string }[]
  track: string
  modes: { id: string; name: string }[]
  mode: string
  /** Best first, each with its distance or race time written out. */
  rows: { name: string; colour: string; vehicle: string; result: string }[]
  /** Each player's best on this track in this mode. */
  bests: { name: string; colour: string; result: string }[]
  onTrack(id: string): void
  onMode(id: string): void
  onBack(): void
}

/** Highscore board: the best runs on a track, with who drove and in what. */
export function showScores(el: HTMLElement, v: ScoresView): void {
  el.innerHTML = `
    <h2>Topplista</h2>
    <div class="seg">${v.tracks.map((t) => `<button class="${t.id === v.track ? 'on' : ''}" data-track="${t.id}">${t.name}</button>`).join('')}</div>
    <div class="seg">${v.modes.map((m) => `<button class="${m.id === v.mode ? 'on' : ''}" data-mode="${m.id}">${m.name}</button>`).join('')}</div>
    <div class="rows scores">
      ${v.rows.length ? v.rows.map((r, i) => `<div style="--c:${r.colour}"><span class="rank">${i + 1}</span><b class="pname">${r.name}</b><span class="veh">${r.vehicle}</span><span class="dist">${r.result}</span></div>`).join('') : '<div class="empty">Inga åk på den här banan än.</div>'}
    </div>
    <div class="bests">${v.bests.map((b) => `<span style="--c:${b.colour}"><b class="pname">${b.name}</b> bäst ${b.result}</span>`).join('')}</div>
    <div class="actions"><button class="big blue" data-act="back">Tillbaka</button></div>`
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.track) v.onTrack(b.dataset.track)
    else if (b?.dataset.mode) v.onMode(b.dataset.mode)
    else if (b?.dataset.act === 'back') v.onBack()
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
