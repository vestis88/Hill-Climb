import type { RunStatus } from '../sim/run'
import { formatTime } from '../data/modes'
import { genitive } from '../data/players'


export interface ResultsView {
  status: RunStatus | 'ended'
  distance: number
  newBest: boolean
  /** Races: the length, and the finish time (absent when the run did not finish). */
  race?: { length: number; time?: number; newBestTime: boolean }
  coins: { track: number; air: number; flips: number; wheelies: number; milestones: number; rescue: number; combos: number; stunts: number }
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
  /** A Klurbana: the time if the goal was reached, and the gems taken. */
  puzzle?: { time?: number; newBestTime: boolean; gems: number; total: number }
  /** A test drive from Trimning: nothing counts, and Back goes to Trimning. */
  sandbox?: boolean
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
      : `<button class="big blue" data-act="garage">${v.sandbox ? 'Trimning' : 'Hem'}</button><button class="big" data-act="again">Kör igen</button>`
  // Two columns when the screen is wide: the result and buttons on the left, the coin breakdown on the right.
  el.innerHTML = `<div class="res">
    <div class="res-main">
    <div class="who" style="--c:${v.player.colour}">${v.player.name}</div>
    <h2>${TITLES[v.status]}</h2>
    ${v.sandbox ? '<div class="sandbox-note">🔧 Testkörning: räknas inte (inga mynt eller rekord)</div>' : ''}
    <div class="results-total"><b class="coin">●</b> <span data-count="${v.total}">0</span></div>
    ${v.puzzle
      ? v.puzzle.time !== undefined
        ? `<div class="racetime">${formatTime(v.puzzle.time)} ${v.puzzle.newBestTime ? '<span class="newbest">Nytt rekord!</span>' : ''}</div>`
        : `<div>Kom inte i mål · ◆ ${v.puzzle.gems} av ${v.puzzle.total} stenar</div>`
      : v.race
      ? v.race.time !== undefined
        ? `<div class="racetime">${formatTime(v.race.time)} ${v.race.newBestTime ? '<span class="newbest">Nytt rekord!</span>' : ''}</div>`
        : `<div>Kom inte i mål: ${Math.floor(v.distance)} av ${v.race.length} m</div>`
      : `<div>${Math.floor(v.distance)} m ${v.newBest ? '<span class="newbest">Nytt rekord!</span>' : ''}</div>`}
    ${v.missions?.length ? `<div class="missions-done">${v.missions.map((m) => `<span>✓ Uppdrag klart: ${m.text} <b class="coin">●</b> ${m.reward}</span>`).join('')}</div>` : ''}
    <div class="actions">${actions}</div>
    </div>
    <div class="rows">
      ${row('Mynt på banan', v.coins.track)}
      ${row('Lufttid', v.coins.air)}
      ${row('Volter', v.coins.flips)}
      ${row('Stegringar', v.coins.wheelies)}
      ${row('Kombo', v.coins.combos)}
      ${row('Loopar och gropar', v.coins.stunts)}
      ${row('Distansbonus', v.coins.milestones)}
      ${row('Bränsle på tom tank', v.coins.rescue)}
      <div class="total"><span>Det här åket</span><span><b class="coin">●</b> <span data-count="${v.total}">0</span></span></div>
      ${v.sandbox ? '' : `<div><span>Du har</span><span><b class="coin">●</b> ${v.bank}</span></div>`}
    </div></div>`
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
    `<button class="choice ${x.on ? 'on' : ''} ${x.owned ? '' : 'locked'}" data-item="${kind}:${x.id}" ${!x.owned && (x.price < 0 || x.price > v.coins) ? 'disabled' : ''}>
      <span class="name">${x.name}</span>${x.owned ? '' : x.price < 0 ? '<span class="price">Hitta alla ★ på en bana</span>' : `<span class="price">Köp ● ${x.price}</span>`}</button>`
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
  /** A heading instead of "Omgångens resultat" (e.g. the duel's winner). */
  heading?: string
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
      ? '<button class="big blue" data-act="home">Hem</button><button class="big" data-act="again">Ny tävling</button>'
      : '<button class="big blue" data-act="home">Hem</button><button class="big" data-act="again">Spela igen</button>'
  el.innerHTML = `
    ${cup?.winners ? `<div class="trophy">🏆</div><div class="who big-who" style="--c:${cup.table[0].colour}">${cup.winners.join(' och ')} ${cup.winners.length > 1 ? 'vinner' : 'vinner'} tävlingen!</div>` : `<h2>${cup ? cup.title : v.heading ?? 'Omgångens resultat'}</h2>`}
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
  bests: { name: string; colour: string; result: string; replay?: boolean }[]
  /** Watch a player's record on this track as a replay. */
  onReplay(name: string): void
  /** The family table: round wins and cup wins per player, and this week's winner. */
  family: { rows: { name: string; colour: string; rounds: number; cups: number; week: number }[]; weekWinner?: string }
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
    <div class="bests">${v.bests.map((b) => `<span style="--c:${b.colour}"><b class="pname">${b.name}</b> bäst ${b.result}${b.replay ? `<button class="play" data-replay="${b.name}" aria-label="Se repris">▶</button>` : ''}</span>`).join('')}</div>
    <div class="family"><div><b>Familjen</b>${v.family.weekWinner ? ` · Veckans vinnare: <b class="week">🏅 ${v.family.weekWinner}</b>` : ''}</div>
      <div class="ftable">${v.family.rows.map((r) => `<span style="--c:${r.colour}"><b class="pname">${r.name}</b> ${r.rounds} omgångar${r.cups ? ` · ${r.cups} 🏆` : ''}${r.week ? ` · ${r.week} denna vecka` : ''}</span>`).join('')}</div></div>
    <div class="actions"><button class="big blue" data-act="back">Tillbaka</button></div>`
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b?.dataset.replay) v.onReplay(b.dataset.replay)
    else if (b?.dataset.track) v.onTrack(b.dataset.track)
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
