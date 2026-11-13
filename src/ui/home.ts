import { FULL_LEVEL, MAX_LEVEL, price, type Levels, type UpgradeId, type UpgradeInfo } from '../data/upgrades'

/**
 * The menus: a home screen with what you are about to drive (vehicle, track) and a big Drive
 * button, and a menu for everything else, each a screen of its own:
 * - Garaget: vehicles, their upgrades and parts;
 * - Banor: tracks and the mode (endless or a race);
 * - Dagens utmaning, Uppdrag (missions);
 * - Tävling and Duell (two or more players), Utstyrsel, Topplista, Inställningar,
 *   and Trimning in test mode.
 * Every sub-menu has Back (to home) and Drive, so a change is one tap from driving.
 */

/** An environment or vehicle the player can pick, buy, or see locked. */
export interface Choice {
  id: string
  name: string
  blurb: string
  price: number
  owned: boolean
  selected: boolean
  /** Shown under the name, e.g. "Rekord 420 m". */
  note?: string
  /** Draws a small picture into the card. */
  preview?: (canvas: HTMLCanvasElement) => void
}

/** Small original icons for the upgrade cards (inline SVG, 24x24). */
export const ICONS: Record<string, string> = {
  engine: '<rect x="5" y="9" width="14" height="10" rx="2" fill="#8b93a1"/><rect x="8" y="4" width="8" height="6" rx="1.5" fill="#c9ced6"/><rect x="2" y="12" width="3" height="4" rx="1" fill="#5b6372"/><rect x="19" y="12" width="3" height="4" rx="1" fill="#5b6372"/><circle cx="12" cy="14" r="2.2" fill="#ffb020"/>',
  tyres: '<circle cx="12" cy="12" r="9.5" fill="#2a2f38"/><circle cx="12" cy="12" r="5" fill="#c9ced6"/><circle cx="12" cy="12" r="1.8" fill="#5b6372"/><g fill="#5b6372"><rect x="11" y="1.5" width="2" height="3"/><rect x="11" y="19.5" width="2" height="3"/><rect x="1.5" y="11" width="3" height="2"/><rect x="19.5" y="11" width="3" height="2"/></g>',
  suspension: '<rect x="4" y="2" width="16" height="3" rx="1" fill="#8b93a1"/><rect x="4" y="19" width="16" height="3" rx="1" fill="#8b93a1"/><path d="M12 5 L17 7.5 L7 10 L17 12.5 L7 15 L17 17.5 L12 19" fill="none" stroke="#f2b632" stroke-width="2" stroke-linejoin="round"/>',
  drivetrain: '<circle cx="8" cy="12" r="5" fill="none" stroke="#c9ced6" stroke-width="3" stroke-dasharray="2.2 1.8"/><circle cx="17" cy="12" r="4" fill="none" stroke="#8b93a1" stroke-width="3" stroke-dasharray="2 1.6"/><circle cx="8" cy="12" r="1.6" fill="#c9ced6"/><circle cx="17" cy="12" r="1.3" fill="#8b93a1"/>',
  weight: '<path d="M5 19 C 7 9, 13 4, 20 3 C 18 10, 13 16, 5 19 Z" fill="#e8ecf2"/><path d="M5 19 L 15 9" stroke="#8b93a1" stroke-width="1.5"/>',
  flip: '<path d="M6 15 A 7 7 0 1 1 13 19" fill="none" stroke="#ffb020" stroke-width="2.6" stroke-linecap="round"/><path d="M2.5 12.5 L6 16.5 L9.5 12.5 Z" fill="#ffb020"/><circle cx="12" cy="12" r="2.4" fill="#c9ced6"/>',
  thrust: '<path d="M12 2 C 16 6, 16 12, 14 16 L10 16 C 8 12, 8 6, 12 2 Z" fill="#c9ced6"/><path d="M10 16 L12 22 L14 16 Z" fill="#ff7a1a"/>',
}

let thumbObserver: ResizeObserver | undefined
/**
 * Draw each preview at its canvas's real size, and again whenever that size changes (rotation,
 * browser bars): a canvas drawn at one size and shown at another looks stretched.
 */
export function drawThumbs(el: HTMLElement, previews: Record<string, ((c: HTMLCanvasElement) => void) | undefined>): void {
  thumbObserver?.disconnect()
  const byCanvas = new Map<Element, (c: HTMLCanvasElement) => void>()
  thumbObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const c = entry.target as HTMLCanvasElement
      if (c.clientWidth && c.clientHeight) byCanvas.get(c)?.(c)
    }
  })
  for (const [key, draw] of Object.entries(previews)) {
    const c = el.querySelector<HTMLCanvasElement>(`canvas[data-thumb="${key}"]`)
    if (c && draw) {
      byCanvas.set(c, draw)
      thumbObserver.observe(c)
    }
  }
}

const choiceHtml = (kind: string, c: Choice, coins: number) => `
  <button class="choice ${c.selected ? 'on' : ''} ${c.owned ? '' : 'locked'}" data-pick="${kind}:${c.id}"
    ${!c.owned && c.price > coins ? 'disabled' : ''}>
    ${c.preview ? `<canvas class="thumb ${kind}" data-thumb="${kind}:${c.id}"></canvas>` : ''}
    <span class="name">${c.name}</span>
    <span class="blurb">${c.owned ? (c.note ?? c.blurb) : c.blurb}</span>
    ${c.owned ? '' : `<span class="price">Lås upp ● ${c.price}</span>`}
  </button>`

const topBar = (title: string, coins: number, canDrive: boolean, back = true) => `
  <div class="bar menu-bar">
    ${back ? '<button class="small back" data-act="home">‹ Hem</button>' : ''}
    <h2>${title}</h2>
    <span class="coins">● ${coins}</span>
    <button class="big" data-act="drive" ${canDrive ? '' : 'disabled'}>Kör</button>
  </div>`

// ---------------------------------------------------------------------------------------

export interface HomeView {
  coins: number
  testMode: boolean
  players: { name: string; colour: string; on: boolean }[]
  onTogglePlayer(name: string): void
  vehicle: { id: string; name: string; detail: string; preview(c: HTMLCanvasElement): void }
  track: { id: string; name: string; detail: string; note: string; preview(c: HTMLCanvasElement): void }
  daily: { title: string; detail: string; on: boolean }
  missions: number
  onDrive(): void
  onMenu(menu: 'vehicles' | 'tracks' | 'daily' | 'missions'): void
  onCup(): void
  onDuel(): void
  onOutfit(): void
  onScores(): void
  onSettings(): void
  onTune(): void
}

export function showHome(el: HTMLElement, v: HomeView): void {
  const two = v.players.filter((p) => p.on).length >= 2
  const tile = (act: string, icon: string, name: string, sub: string, opts: { disabled?: boolean; cls?: string } = {}) =>
    `<button class="tile ${opts.cls ?? ''}" data-act="${act}" ${opts.disabled ? 'disabled' : ''}><span class="ticon">${icon}</span><span class="tname">${name}</span><span class="tsub">${sub}</span></button>`
  el.innerHTML = `
    <div class="bar home-bar">
      <h1>Ridgeline${v.testMode ? ' <span class="badge">TESTLÄGE</span>' : ''}</h1>
      <div class="players" role="group" aria-label="Vem spelar">${v.players.map((p) => `<button class="player ${p.on ? 'on' : ''}" data-player="${p.name}" style="--c:${p.colour}" aria-pressed="${p.on}"><span class="tick">${p.on ? '✓' : ''}</span>${p.name}</button>`).join('')}</div>
      <span class="coins">● ${v.coins}</span>
      <button class="small icon" data-act="settings" aria-label="Inställningar">⚙</button>
    </div>
    <div class="hero">
      <button class="pick-card" data-act="vehicles">
        <span class="pk-label">Fordon</span>
        <canvas class="pk-thumb vehicle" data-thumb="home:vehicle"></canvas>
        <span class="pk-name">${v.vehicle.name}</span>
        <span class="pk-detail">${v.vehicle.detail}</span>
        <span class="pk-change">Garaget ›</span>
      </button>
      <button class="pick-card ${v.daily.on ? 'daily-on' : ''}" data-act="tracks">
        <span class="pk-label">${v.daily.on ? 'Dagens utmaning' : 'Bana'}</span>
        <canvas class="pk-thumb" data-thumb="home:track"></canvas>
        <span class="pk-name">${v.track.name}</span>
        <span class="pk-detail">${v.track.detail}</span>
        <span class="pk-change">${v.track.note || 'Byt bana ›'}</span>
      </button>
      <div class="go-col">
        <button class="big huge" data-act="drive" ${v.players.some((p) => p.on) ? '' : 'disabled'}>Kör!</button>
        <span class="go-who">${v.players.some((p) => p.on) ? v.players.filter((p) => p.on).map((p) => p.name).join(', ') : 'Välj vem som spelar'}</span>
      </div>
    </div>
    <div class="tiles">
      ${tile('daily', '☀️', 'Dagens utmaning', v.daily.detail, { cls: 'gold' })}
      ${tile('missions', '🎯', 'Uppdrag', v.missions ? `${v.missions} att klara` : 'Välj spelare')}
      ${tile('cup', '🏆', 'Tävling', two ? '3 banor, poäng' : 'Minst 2 spelare', { disabled: !two })}
      ${tile('duel', '⚔️', 'Duell', two ? 'Två samtidigt' : 'Minst 2 spelare', { disabled: !two })}
      ${tile('outfit', '🪖', 'Utstyrsel', 'Hjälm och hatt')}
      ${tile('scores', '📋', 'Topplista', 'Rekord och repriser')}
      ${v.testMode ? tile('tune', '🔧', 'Trimning', 'Provkör allt, räknas inte', { cls: 'test' }) : ''}
    </div>`
  drawThumbs(el, { 'home:vehicle': v.vehicle.preview, 'home:track': v.track.preview })
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.player) return v.onTogglePlayer(b.dataset.player)
    const act = b.dataset.act
    if (act === 'drive') v.onDrive()
    else if (act === 'vehicles' || act === 'tracks' || act === 'daily' || act === 'missions') v.onMenu(act)
    else if (act === 'cup') v.onCup()
    else if (act === 'duel') v.onDuel()
    else if (act === 'outfit') v.onOutfit()
    else if (act === 'scores') v.onScores()
    else if (act === 'settings') v.onSettings()
    else if (act === 'tune') v.onTune()
  }
}

// ---------------------------------------------------------------------------------------

export interface VehiclesView {
  coins: number
  canDrive: boolean
  vehicles: Choice[]
  /** The selected vehicle. */
  vehicle: { id: string; name: string; blurb: string; preview(c: HTMLCanvasElement): void }
  upgrades: UpgradeInfo[]
  /** Levels bought, and the levels driven (the same, or lower if chosen). */
  levels: Levels
  using: Levels
  parts: { id: string; name: string; blurb: string; price: number; owned: boolean; on: boolean }[]
  /** The upgrade just bought, to play its card animation once. */
  justBought?: UpgradeId
  onPick(id: string): void
  onBuy(id: UpgradeId): void
  /** Drive an upgrade at another level (1 up to the level bought). */
  onUse(id: UpgradeId, level: number): void
  onPart(id: string): void
  onHome(): void
  onDrive(): void
}

export function showVehicles(el: HTMLElement, v: VehiclesView): void {
  const card = (u: UpgradeInfo) => {
    const level = v.levels[u.id]
    const using = v.using[u.id]
    const maxed = level >= MAX_LEVEL
    const cost = maxed ? 0 : price(level + 1)
    const bought = v.justBought === u.id
    // Levels driven (green, orange for the galna levels above FULL_LEVEL), bought but not driven
    // (outlined), and not bought yet (grey); a small gap before the galna levels.
    const pips = Array.from({ length: MAX_LEVEL }, (_, i) => {
      const cls = i < using ? (i >= FULL_LEVEL ? 'on wild' : 'on') : i < level ? 'owned' : ''
      return `<i class="${cls} ${i === FULL_LEVEL ? 'gap' : ''} ${bought && i === level - 1 ? 'new' : ''}"></i>`
    }).join('')
    const stepper = level > 1
      ? `<span class="use"><button data-use="${u.id}:${using - 1}" ${using <= 1 ? 'disabled' : ''} aria-label="Lägre nivå">−</button><b>${using}</b><button data-use="${u.id}:${using + 1}" ${using >= level ? 'disabled' : ''} aria-label="Högre nivå">+</button></span>`
      : `<span class="lvl">1/${MAX_LEVEL}</span>`
    return `<div class="card ${bought ? 'bought' : ''} ${using > FULL_LEVEL ? 'wild' : ''}">
      <div class="name"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[u.id] ?? ''}</svg>${u.name}${stepper}</div>
      <div class="pips">${pips}</div>
      <div class="blurb">${using < level ? `Kör nivå ${using} av ${level} köpta` : u.blurb}</div>
      <button class="buy ${level >= FULL_LEVEL ? 'wild' : ''}" data-buy="${u.id}" ${maxed || cost > v.coins ? 'disabled' : ''}>${maxed ? 'Max' : `${level >= FULL_LEVEL ? 'Galen nivå' : 'Uppgradera'} ● ${cost}`}</button>
    </div>`
  }
  el.innerHTML = `
    ${topBar('Garaget', v.coins, v.canDrive)}
    <div class="split">
      <div class="choices vehicles">${v.vehicles.map((c) => choiceHtml('vehicle', c, v.coins)).join('')}</div>
      <div class="detail">
        <div class="detail-head"><canvas class="detail-thumb vehicle" data-thumb="detail:vehicle"></canvas>
          <div><div class="pk-name">${v.vehicle.name}</div><div class="pk-detail">${v.vehicle.blurb}</div></div></div>
        <div class="label">Uppgraderingar</div>
        <div class="cards two">${v.upgrades.map(card).join('')}</div>
        <div class="label">Del (en åt gången)</div>
        <div class="partrow">${v.parts.map((p) => `<button class="part ${p.on ? 'on' : ''} ${p.owned ? '' : 'locked'}" data-part="${p.id}" ${!p.owned && p.price > v.coins ? 'disabled' : ''} title="${p.blurb}"><b>${p.name}</b>${p.blurb ? `<small>${p.blurb}</small>` : ''}${p.owned ? '' : `<span class="price">Köp ● ${p.price}</span>`}</button>`).join('')}</div>
      </div>
    </div>`
  drawThumbs(el, {
    'detail:vehicle': v.vehicle.preview,
    ...Object.fromEntries(v.vehicles.map((c) => [`vehicle:${c.id}`, c.preview])),
  })
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.buy) v.onBuy(b.dataset.buy as UpgradeId)
    else if (b.dataset.use) {
      const [id, level] = b.dataset.use.split(':')
      v.onUse(id as UpgradeId, Number(level))
    } else if (b.dataset.part) v.onPart(b.dataset.part)
    else if (b.dataset.pick) v.onPick(b.dataset.pick.split(':')[1])
    else if (b.dataset.act === 'home') v.onHome()
    else if (b.dataset.act === 'drive') v.onDrive()
  }
}

// ---------------------------------------------------------------------------------------

export interface TracksView {
  coins: number
  canDrive: boolean
  tracks: Choice[]
  modes: { id: string; name: string; on: boolean }[]
  onPick(id: string): void
  onMode(id: string): void
  onHome(): void
  onDrive(): void
}

export function showTracks(el: HTMLElement, v: TracksView): void {
  el.innerHTML = `
    ${topBar('Banor', v.coins, v.canDrive)}
    <div class="modebar"><span class="label">Läge</span><div class="seg">${v.modes.map((m) => `<button class="${m.on ? 'on' : ''}" data-mode="${m.id}">${m.name}</button>`).join('')}</div></div>
    <div class="choices envs">${v.tracks.map((c) => choiceHtml('env', c, v.coins)).join('')}</div>`
  drawThumbs(el, Object.fromEntries(v.tracks.map((c) => [`env:${c.id}`, c.preview])))
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.mode) v.onMode(b.dataset.mode)
    else if (b.dataset.pick) v.onPick(b.dataset.pick.split(':')[1])
    else if (b.dataset.act === 'home') v.onHome()
    else if (b.dataset.act === 'drive') v.onDrive()
  }
}

// ---------------------------------------------------------------------------------------

export interface DailyView {
  coins: number
  title: string
  events: { id: 'race' | 'endless'; name: string; blurb: string; note: string; on: boolean; preview(c: HTMLCanvasElement): void }[]
  track: (c: HTMLCanvasElement) => void
  canDrive: boolean
  onGo(id: 'race' | 'endless'): void
  onHome(): void
}

export function showDaily(el: HTMLElement, v: DailyView): void {
  el.innerHTML = `
    <div class="bar menu-bar"><button class="small back" data-act="home">‹ Hem</button><h2>Dagens utmaning</h2><span class="coins">● ${v.coins}</span></div>
    <canvas class="daily-track" data-thumb="daily:track"></canvas>
    <div class="label daily-label">${v.title}</div>
    <div class="daily-events">${v.events.map((d) => `
      <div class="devent ${d.on ? 'on' : ''}">
        <canvas class="thumb vehicle" data-thumb="daily:${d.id}"></canvas>
        <div class="dtext"><b>${d.name}</b><span>${d.blurb}</span><span class="note">${d.note}</span></div>
        <button class="big" data-go="${d.id}" ${v.canDrive ? '' : 'disabled'}>Kör</button>
      </div>`).join('')}</div>
    <div class="hint">Samma bana och trimning för alla i dag. En ny utmaning varje dag.</div>`
  drawThumbs(el, { 'daily:track': v.track, ...Object.fromEntries(v.events.map((d) => [`daily:${d.id}`, d.preview])) })
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.go) v.onGo(b.dataset.go as 'race' | 'endless')
    else if (b.dataset.act === 'home') v.onHome()
  }
}

// ---------------------------------------------------------------------------------------

export interface MissionsView {
  coins: number
  canDrive: boolean
  players: { name: string; colour: string; items: { text: string; reward: number }[] }[]
  onHome(): void
  onDrive(): void
}

export function showMissions(el: HTMLElement, v: MissionsView): void {
  el.innerHTML = `
    ${topBar('Uppdrag', v.coins, v.canDrive)}
    <div class="hint">Klara ett uppdrag i ett åk för att få mynten. Ett nytt kommer direkt i dess ställe.</div>
    ${v.players.length
      ? `<div class="missions">${v.players.map((p) => `<div class="mrow" style="--c:${p.colour}"><b class="pname">${p.name}</b>${p.items.map((m) => `<span class="mission">${m.text} <b class="coin">●</b> ${m.reward}</span>`).join('')}</div>`).join('')}</div>`
      : '<div class="hint">Välj vem som spelar på startsidan.</div>'}`
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (!b || b.disabled) return
    if (b.dataset.act === 'home') v.onHome()
    else if (b.dataset.act === 'drive') v.onDrive()
  }
}
