import type { Input, VehicleSpec } from './sim/types'
import { PARTS, partEffects, type PartId } from './data/parts'
import { ALL_STARS_COINS, STAR_COINS, starsFor } from './game/stars'
import { DEFAULT_OUTFIT, HATS, PATTERNS, type Hat, type Outfit, type Pattern } from './data/outfits'
import { drawHead, setOutfit } from './render/art'
import { describe, done, fillMissions, type Mission, type RunStats } from './game/missions'
import { CUP_TRACKS, cupTable, cupWinners, lastTrack, newCup, scoreTrack, type Cup } from './game/cup'
import { advance, emptyRound, nextPlayerOf, nextRound, playerOf, recordTurn, roundOver, standings, together, type Round } from './game/round'
import { WEATHER_NAME, type Atmosphere } from './data/weather'
import { EngineRevs, LAUNCH } from './sim/launch'
import { dailyFor, dateKey, oldDaily } from './data/daily'
import { ENVIRONMENTS, environment, heightFor, puddlesFor } from './data/environments'
import { stuntAvoid } from './sim/stunt'
import { PickupField } from './data/track'
import { VEHICLES, vehicleEntry } from './data/vehicles'
import { applyUpgrades, MAX_LEVEL, price, type UpgradeId } from './data/upgrades'
import { Sound } from './audio/sound'
import { createInput } from './input/input'
import { GameRenderer, type Popup } from './render/game'
import { drawEnvironmentPreview, drawVehiclePreview } from './render/preview'
import { addScore, drivenLevels, earn, emptySave, levelsFor, loadSave, setDrivenLevel, playerBest, playerTime, spend, writeSave } from './save/save'
import { clearGhosts, poseToState, roundGhosts, GhostRecorder, GhostTrack, loadGhost, storeGhost, storeVehicleBest, vehicleKey, type Ghost } from './save/ghosts'
import { CloudSync } from './save/cloud'
import { PLAYERS, playerColour } from './data/players'
import { formatTime, gameMode, MODES, recordKey } from './data/modes'
import { Run, RULES } from './sim/run'
import type { SimState } from './sim/types'
import { STEP } from './sim/world'
import { showOutfit, showResults, showScores, showStandings, showTurn } from './ui/screens'
import { showDaily, showHome, showMissions, showTracks, showVehicles } from './ui/home'
import { confirmPurchase } from './ui/confirm'
import { loadSandbox, saveSandbox, sandboxSpec } from './game/sandbox'
import { loadSettings, saveSettings, showSettings } from './ui/settings'
import { trackViewport, updateViewport } from './ui/viewport'
import { showTuning, tuningEnabled } from './ui/tuning'

trackViewport()
const $ = (id: string) => document.getElementById(id) as HTMLElement
const canvas = $('game') as HTMLCanvasElement
const garageEl = $('garage')
const resultsEl = $('results')
const scoresEl = $('scores')
const tuneEl = $('tune')
const settingsEl = $('settings')
const endRunBtn = $('endRun')
const pauseBtn = $('pauseBtn')
const pausedEl = $('paused')
const updateBtn = $('update')
const hornBtn = $('horn')
const replayBar = $('replayBar')
replayBar.addEventListener('click', (e) => (e.target as HTMLElement).closest('button') && endReplay())
const boostBtn = $('boost')
/** The boost button (thrusters): held down while touched, or Space / Up on a keyboard. */
let boosting = false
let thrustSound = 0
const setBoost = (on: boolean) => {
  boosting = on
  boostBtn.classList.toggle('on', on)
}
boostBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  boostBtn.setPointerCapture(e.pointerId)
  setBoost(true)
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) boostBtn.addEventListener(type, () => setBoost(false))
window.addEventListener('keydown', (e) => (e.code === 'Space' || e.code === 'ArrowUp') && mode === 'driving' && setBoost(true))
window.addEventListener('keyup', (e) => (e.code === 'Space' || e.code === 'ArrowUp') && setBoost(false))

const settings = loadSettings()
const sound = new Sound()
sound.setVolume(settings.volume, settings.sound)
const controls = createInput(canvas, () => settings.swapPedals)
// Safari only allows sound after a tap; any first touch or click unlocks it.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => { sound.unlock(); applyMusic() }, { capture: true })
const renderer = new GameRenderer(canvas)
// The second player's half of the screen in a duel: its own canvas, renderer and pedals.
const canvas2 = $('game2') as HTMLCanvasElement
const renderer2 = new GameRenderer(canvas2)
const controls2 = createInput(canvas2, () => settings.swapPedals)
const save = loadSave()
pruneOldDailies()

/**
 * Today's challenge leaves records under its date; drop those (bests, times, highscores and
 * ghosts) once they are more than two weeks old, so they do not pile up.
 */
function pruneOldDailies(): void {
  const now = dateKey(new Date())
  const old = (k: string) => oldDaily(k, now)
  const strip = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => !old(k)))
  save.best = strip(save.best)
  for (const p of Object.keys(save.playerBest)) save.playerBest[p] = strip(save.playerBest[p])
  for (const p of Object.keys(save.playerTimes)) save.playerTimes[p] = strip(save.playerTimes[p])
  save.scores = save.scores.filter((x) => !old(x.env))
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i) ?? ''
      const at = k.indexOf('.daily-')
      if (k.startsWith('ridgeline.ghost.') && at >= 0 && old(k.slice(at + 1))) localStorage.removeItem(k)
    }
  } catch {
    // Storage unavailable.
  }
}
// Shares progress between the family's devices (see save/cloud.ts); off until set up.
const cloud = new CloudSync(save)
/** Save locally, and sync to the family's other devices shortly after. */
function persist(): void {
  writeSave(save)
  cloud.soon()
}
/** Trimning's sandbox (game/sandbox.ts), and whether the run in progress is one of its test drives (never counts). */
const sandbox = loadSandbox()
let sandboxRun = false
/** Which menu the garage screen shows: home, or one of its sub-menus. */
type Menu = 'home' | 'vehicles' | 'tracks' | 'daily' | 'missions'
let menu: Menu = 'home'

type Mode = 'garage' | 'driving' | 'ending' | 'results' | 'tuning' | 'settings' | 'scores' | 'replay' | 'duel'
let mode: Mode = 'garage'
/** Today's challenge, when one of its two events is picked in the garage (not saved). */
let daily: 'race' | 'endless' | null = null
/** A tournament in progress: three tracks, points per placing (src/game/cup.ts). */
let cup: Cup | null = null
/** A record being watched as a replay (from Topplista). */
let replay: { track: GhostTrack; t: number; env: string; startX: number; spec: VehicleSpec; player: string; back: () => void } | null = null
/** This run's time of day and weather (today's challenge only). */
let atmosphere: Atmosphere | undefined
/** Seconds left of the start countdown, and the engine revs it shows (sim/launch.ts). */
let countdown = 0
let revs = new EngineRevs(0.6)
/** Seconds of engine bog left after a start below the green; it begins with the first gas. */
let bogLeft = 0
let bogStarted = false
/**
 * A round: each ticked player drives once, in turn, on the same vehicle and track; then the
 * standings. One player alone is a round of one.
 */
let round: Round = emptyRound(save.players)
/** Ghosts raced this run, and the recorder for this run's own ghost. */
let ghosts: { label: string; colour: string; track: GhostTrack }[] = []
let recorder = new GhostRecorder(2)
let run = newRun()
let prev: SimState = run.sim.state()
let next: SimState = prev
let popups: Popup[] = []
let endTimer = 0


// Function declarations, not arrow consts: the first run is created above, before this point.
function owned(id: string, price: number): boolean {
  return price === 0 || save.unlocked.includes(id)
}
const today = () => dailyFor(new Date())
function currentEnv() {
  if (replay) return environment(replay.env)
  if (sandboxRun) return environment(sandbox.envId)
  return daily ? today().env : cup ? environment(cup.tracks[cup.index]) : environment(save.envId)
}
/** Where this track's records live: the map, or today's challenge ("daily-2026-11-12"). */
function recordEnvId(): string {
  return daily ? today().id : currentEnv().id
}
/** The track's name for screens: the map, or "Dagens lopp · Frostpasset". */
function trackName(): string {
  if (cup) return `Tävling, bana ${cup.index + 1} av ${CUP_TRACKS} · ${currentEnv().name}${currentMode().length ? ` · ${currentMode().name}` : ''}`
  return daily ? `${daily === 'race' ? 'Dagens lopp' : 'Dagens oändliga'} · ${currentEnv().name}` : currentEnv().name
}
function currentVehicle() {
  return vehicleEntry(save.vehicleId)
}
/** The vehicle a player drives in a round with several players: their own pick, else the garage's. */
function playerVehicle(name: string) {
  const id = save.playerVehicles?.[name]
  const v = id ? VEHICLES.find((x) => x.id === id) : undefined
  return v && owned(v.id, v.price) ? v : currentVehicle()
}
/** The vehicle for the turn being driven now. */
function driveVehicle() {
  if (sandboxRun) return vehicleEntry(sandbox.vehicleId)
  if (daily) return vehicleEntry(today()[daily].vehicle)
  return together(round) ? playerVehicle(currentPlayer()) : currentVehicle()
}
function currentMode() {
  if (sandboxRun) return gameMode(sandbox.modeId)
  if (daily) return gameMode(daily === 'race' ? 'race500' : 'endless')
  return gameMode(save.modeId)
}
/** Where this track's records are kept in the current mode (bests, ghosts, scores). */
function currentKey(): string {
  return recordKey(recordEnvId(), currentMode().id)
}
function currentPlayer(): string {
  return playerOf(round, save.players[0] ?? PLAYERS[0].name)
}

/** The part fitted to a vehicle (none on the daily challenge, where all are tuned alike). */
function partFor(vehicleId: string): PartId {
  if (daily || sandboxRun) return 'none'
  const id = save.parts?.[vehicleId] ?? 'none'
  return id === 'none' || save.unlocked.includes(`part:${id}`) ? id : 'none'
}

function vehicleSpec() {
  const spec = upgradedSpec()
  // Stötdämpare: more damping and slightly softer springs.
  const fx = partEffects(partFor(spec.id))
  return fx.damping === 1 ? spec : { ...spec, wheels: spec.wheels.map((w) => ({ ...w, damping: w.damping * fx.damping, springHz: w.springHz * fx.springs })) }
}

function upgradedSpec() {
  const entry = driveVehicle()
  // A test drive from Trimning: its levels, hand-set values and every-vehicle factors.
  if (sandboxRun) return sandboxSpec(sandbox, entry.id, drivenLevels(save, entry.id))
  // Otherwise the family's own upgrades, at the levels they chose (or today's challenge's set tuning).
  const levels = daily ? today()[daily].levels : drivenLevels(save, entry.id)
  return applyUpgrades(entry.base, entry.full, levels)
}

function newRun(): Run {
  const env = currentEnv()
  const height = heightFor(env)
  return new Run({
    vehicle: vehicleSpec(),
    height,
    gravity: env.gravity,
    groundFriction: env.groundFriction,
    puddles: puddlesFor(env),
    pickups: new PickupField(height, env.seed, env.stunt ? stuntAvoid(env.seed) : undefined),
    stunt: env.stunt ? env.seed : undefined,
    // Distance bonuses count from this player's own best.
    bestDistance: playerBest(save, currentPlayer(), recordEnvId()),
    finish: currentMode().length,
    assist: settings.help.includes(currentPlayer()),
    part: partFor(driveVehicle().id),
    stars: sandboxRun ? [] : starsFor(env).filter((s) => !save.unlocked.includes(s.id)),
  })
}

function show(m: Mode): void {
  mode = m
  garageEl.classList.toggle('hidden', m !== 'garage')
  resultsEl.classList.toggle('hidden', m !== 'results')
  scoresEl.classList.toggle('hidden', m !== 'scores')
  tuneEl.classList.toggle('hidden', m !== 'tuning')
  settingsEl.classList.toggle('hidden', m !== 'settings')
  endRunBtn.classList.toggle('hidden', m !== 'driving' && m !== 'duel')
  document.body.classList.toggle('duel', m === 'duel')
  canvas2.classList.toggle('hidden', m !== 'duel')
  pauseBtn.classList.toggle('hidden', m !== 'driving' && m !== 'duel')
  replayBar.classList.toggle('hidden', m !== 'replay')
  hornBtn.classList.toggle('hidden', m !== 'driving')
  boostBtn.classList.toggle('hidden', m !== 'driving' || !driveVehicle().base.thrusters)
  document.body.classList.toggle('swapped', settings.swapPedals)
  setBoost(false)
  pausedEl.classList.add('hidden')
  paused = false
  document.body.classList.toggle('playing', m === 'driving' || m === 'ending')
  controls.reset()
  showUpdateIfReady()
  applyMusic()
}

/** Music: normal in the menus, quiet during a run, off when turned off (or with all sound off). */
function applyMusic(): void {
  sound.setMusic(!settings.music || !settings.sound ? 0 : mode === 'driving' || mode === 'ending' ? 0.35 : 1)
}

/** Pause a run: the world stops, the engine goes quiet, and a menu offers to go on or end it. */
let paused = false
function pause(): void {
  if ((mode !== 'driving' && mode !== 'duel') || paused) return
  paused = true
  pausedEl.classList.remove('hidden')
  pauseBtn.classList.add('hidden')
  endRunBtn.classList.add('hidden')
  hornBtn.classList.add('hidden')
  boostBtn.classList.add('hidden')
  setBoost(false)
  controls.reset()
}
function resume(): void {
  if (!paused) return
  paused = false
  pausedEl.classList.add('hidden')
  pauseBtn.classList.remove('hidden')
  endRunBtn.classList.remove('hidden')
  hornBtn.classList.remove('hidden')
  boostBtn.classList.toggle('hidden', !driveVehicle().base.thrusters)
  controls.reset()
}
pauseBtn.addEventListener('click', pause)
// The horn: just for fun, it changes nothing.
hornBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  sound.horn(driveVehicle().id)
})
pausedEl.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest('button')?.dataset.act
  if (act === 'resume') resume()
  else if (act === 'end') {
    resume()
    if (mode === 'duel') finishDuel()
    else finishRun()
  }
})

/**
 * A newer version published while the game is open (a home-screen app can stay open for days):
 * offer to reload, but never in the middle of a run.
 */
let updateReady = false
function showUpdateIfReady(): void {
  updateBtn.classList.toggle('hidden', !updateReady || mode === 'driving' || mode === 'ending')
}
async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch('./version.json', { cache: 'no-store' })
    const { id } = (await res.json()) as { id?: string }
    if (id && id !== __BUILD_ID__) {
      updateReady = true
      showUpdateIfReady()
    }
  } catch {
    // Offline: try again later.
  }
}
updateBtn.addEventListener('click', () => location.reload())
if (import.meta.env.PROD) {
  void checkForUpdate()
  setInterval(() => void checkForUpdate(), 5 * 60 * 1000)
  document.addEventListener('visibilitychange', () => !document.hidden && void checkForUpdate())
}

/** Back to the home screen. */
function goHome(): void {
  menu = 'home'
  openGarage()
}

/** Open a menu: home, or one of its sub-menus. */
function openMenu(m: Menu): void {
  menu = m
  openGarage()
}

/** Today's challenge's line: track, terrain style and weather. */
function dailyTitle(): string {
  const d = today()
  const weather = WEATHER_NAME[d.atmosphere.weather]
  return `${d.env.name} · ${d.style}${weather ? ` · ${weather}` : ''}`
}

/** Draw the garage screen's current menu (home by default). */
function openGarage(justBought?: UpgradeId): void {
  const vehicle = currentVehicle()
  const canDrive = save.players.length > 0
  const common = { coins: save.coins, canDrive, onHome: goHome, onDrive: startRound }
  if (menu === 'vehicles') {
    const levels = levelsFor(save, vehicle.id)
    const using = drivenLevels(save, vehicle.id)
    showVehicles(garageEl, {
      ...common,
      vehicles: VEHICLES.map((v) => ({
        id: v.id, name: v.name, blurb: v.blurb, price: v.price,
        owned: owned(v.id, v.price), selected: v.id === vehicle.id,
        preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base),
      })),
      vehicle: { id: vehicle.id, name: vehicle.name, blurb: vehicle.blurb, preview: (c) => drawVehiclePreview(c, applyUpgrades(vehicle.base, vehicle.full, using)) },
      upgrades: vehicle.upgrades,
      levels,
      using,
      onUse: (id, level) => {
        setDrivenLevel(save, vehicle.id, id, level)
        writeSave(save)
        run = newRun()
        openGarage()
      },
      parts: PARTS.map((p) => ({ ...p, owned: p.price === 0 || save.unlocked.includes(`part:${p.id}`), on: (save.parts?.[vehicle.id] ?? 'none') === p.id })),
      justBought,
      onPick: (id) => pick('vehicle', id),
      onBuy: buy,
      onPart: (id) => fitPart(vehicle.id, id),
    })
  } else if (menu === 'tracks') {
    showTracks(garageEl, {
      ...common,
      tracks: ENVIRONMENTS.map((e) => ({
        id: e.id, name: e.name, blurb: e.blurb, price: e.price,
        owned: owned(e.id, e.price), selected: !daily && e.id === currentEnv().id,
        note: `Rekord ${Math.floor(save.best[e.id] ?? 0)} m · ★ ${starsFor(e).filter((s) => save.unlocked.includes(s.id)).length}/3`,
        preview: (c: HTMLCanvasElement) => drawEnvironmentPreview(c, e, heightFor(e)),
      })),
      modes: MODES.map((m) => ({ id: m.id, name: m.name, on: !daily && m.id === currentMode().id })),
      onPick: (id) => pick('env', id),
      onMode: (id: string) => {
        daily = null
        save.modeId = id
        persist()
        openGarage()
      },
    })
  } else if (menu === 'daily') {
    const d = today()
    showDaily(garageEl, {
      coins: save.coins,
      canDrive,
      title: dailyTitle(),
      track: (c) => drawEnvironmentPreview(c, d.env, heightFor(d.env)),
      events: (['race', 'endless'] as const).map((id) => {
        const v = vehicleEntry(d[id].vehicle)
        const key = recordKey(d.id, id === 'race' ? 'race500' : 'endless')
        const results = PLAYERS.map((p) => ({ name: p.name, t: playerTime(save, p.name, key), m: playerBest(save, p.name, d.id) }))
        const leader = id === 'race' ? results.filter((r) => r.t < Infinity).sort((a, b) => a.t - b.t)[0] : results.filter((r) => r.m > 0).sort((a, b) => b.m - a.m)[0]
        return {
          id,
          name: id === 'race' ? 'Dagens lopp · 500 m' : 'Dagens oändliga',
          blurb: `${v.name}, trimmad lika för alla`,
          note: leader ? `Bäst i dag: ${leader.name} ${id === 'race' ? formatTime(leader.t) : `${Math.floor(leader.m)} m`}` : 'Ingen har kört än',
          on: daily === id,
          preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base),
        }
      }),
      onGo: (id) => {
        daily = id
        startRound()
      },
      onHome: goHome,
    })
  } else if (menu === 'missions') {
    showMissions(garageEl, {
      ...common,
      players: save.players.map((p) => ({
        name: p,
        colour: playerColour(p),
        items: missionsFor(p).map((m) => ({ text: describe(m, (id) => environment(id).name), reward: m.reward })),
      })),
    })
  } else {
    const env = currentEnv()
    const levels = drivenLevels(save, vehicle.id)
    const avg = vehicle.upgrades.reduce((sum, u) => sum + levels[u.id], 0) / vehicle.upgrades.length
    const part = PARTS.find((p) => p.id === partFor(vehicle.id))
    showHome(garageEl, {
      coins: save.coins,
      testMode: tuningEnabled(),
      players: PLAYERS.map((p) => ({ name: p.name, colour: p.colour, on: save.players.includes(p.name) })),
      onTogglePlayer: togglePlayer,
      vehicle: {
        id: vehicle.id,
        name: vehicle.name,
        detail: `Uppgraderad ${avg.toFixed(1).replace('.', ',').replace(',0', '')}/${MAX_LEVEL}${part && part.id !== 'none' ? ` · ${part.name}` : ''}`,
        preview: (c) => drawVehiclePreview(c, applyUpgrades(vehicle.base, vehicle.full, levels)),
      },
      track: {
        id: env.id,
        name: daily ? (daily === 'race' ? 'Dagens lopp' : 'Dagens oändliga') : env.name,
        detail: daily ? dailyTitle() : currentMode().name,
        note: daily ? 'Byt bana ›' : `Rekord ${Math.floor(playerBest(save, currentPlayer(), env.id))} m · ★ ${starsFor(env).filter((s) => save.unlocked.includes(s.id)).length}/3`,
        preview: (c) => drawEnvironmentPreview(c, env, heightFor(env)),
      },
      daily: { title: 'Dagens utmaning', detail: today().env.name, on: !!daily },
      missions: save.players.reduce((n, p) => n + missionsFor(p).length, 0),
      onDrive: startRound,
      onMenu: openMenu,
      onCup: startCup,
      onDuel: startDuel,
      onOutfit: () => openOutfit(save.players[0] ?? PLAYERS[0].name),
      onScores: () => openScores(recordEnvId(), currentMode().id),
      onSettings: openSettings,
      onTune: openTuning,
    })
  }
  show('garage')
}

/** Fit a part to a vehicle, buying it first (after asking) if the family does not have it. */
function fitPart(vehicleId: string, id: string): void {
  const p = PARTS.find((x) => x.id === id)
  if (!p) return
  const fit = () => {
    save.parts = { ...save.parts, [vehicleId]: p.id }
    persist()
    run = newRun()
    openGarage()
  }
  if (p.price > 0 && !save.unlocked.includes(`part:${p.id}`)) {
    if (save.coins < p.price) return
    confirmPurchase({
      title: `Köpa ${p.name}?`,
      detail: `${p.blurb} Delen kan sättas på alla fordon, en åt gången.`,
      price: p.price,
      coins: save.coins,
      onYes: () => {
        if (!spend(save, p.price)) return
        save.unlocked.push(`part:${p.id}`)
        sound.fanfare()
        fit()
      },
    })
    return
  }
  fit()
}

/** Tick or untick a player for the next round; turns go in the PLAYERS order. */
function togglePlayer(name: string): void {
  const on = new Set(save.players)
  if (on.has(name)) on.delete(name)
  else on.add(name)
  save.players = PLAYERS.map((p) => p.name).filter((n) => on.has(n))
  persist()
  openGarage()
}

function openScores(envId: string, modeId: string): void {
  // Today's challenge has its own tab, with its two events.
  const d = today()
  const isDaily = envId === d.id
  const env = isDaily ? { id: d.id } : environment(envId)
  const modes = isDaily ? MODES.filter((x) => x.id === 'endless' || x.id === 'race500') : MODES
  const m = modes.find((x) => x.id === modeId) ?? modes[0]
  const key = recordKey(env.id, m.id)
  showScores(scoresEl, {
    family: familyTable(),
    tracks: [...ENVIRONMENTS.map((e) => ({ id: e.id, name: e.name })), { id: d.id, name: 'Dagens' }],
    track: env.id,
    modes: modes.map((x) => ({ id: x.id, name: x.name })),
    mode: m.id,
    rows: save.scores
      .filter((s) => s.env === env.id && (s.mode ?? 'endless') === m.id)
      .map((s) => ({ name: s.name, colour: playerColour(s.name), vehicle: vehicleEntry(s.vehicle).name, result: s.time !== undefined ? formatTime(s.time) : m.length ? `Ej i mål · ${Math.floor(s.distance)} m` : `${Math.floor(s.distance)} m` })),
    bests: PLAYERS.map((p) => {
      const t = playerTime(save, p.name, key)
      return { name: p.name, colour: p.colour, replay: !!loadGhost(p.name, key, 'best') && !isDaily, result: m.length ? (t < Infinity ? formatTime(t) : '–') : `${Math.floor(playerBest(save, p.name, env.id))} m` }
    }),
    onReplay: (name) => startReplay(name, key, () => openScores(envId, modeId)),
    onTrack: (id) => openScores(id, m.id),
    onMode: (id) => openScores(env.id, id),
    onBack: () => openGarage(),
  })
  show('scores')
}

/** Select a vehicle or environment, buying it first (after asking) if it is locked and affordable. */
function pick(kind: 'vehicle' | 'env', id: string): void {
  const item = kind === 'vehicle' ? vehicleEntry(id) : environment(id)
  const select = () => {
    if (kind === 'vehicle') save.vehicleId = item.id
    else {
      save.envId = item.id
      daily = null
    }
    persist()
    run = newRun()
    prev = next = run.sim.state()
    renderer.resetCamera(next)
    openGarage()
  }
  if (!owned(item.id, item.price)) {
    if (save.coins < item.price) return
    confirmPurchase({
      title: `Låsa upp ${item.name}?`,
      detail: item.blurb,
      price: item.price,
      coins: save.coins,
      onYes: () => {
        if (!spend(save, item.price)) return
        save.unlocked.push(item.id)
        sound.fanfare()
        select()
      },
    })
    return
  }
  select()
}

/** Buy the next level of an upgrade for the selected vehicle, after asking. */
function buy(id: UpgradeId): void {
  const vehicle = currentVehicle()
  const levels = levelsFor(save, vehicle.id)
  if (levels[id] >= MAX_LEVEL) return
  const cost = price(levels[id] + 1)
  if (save.coins < cost) return
  const info = vehicle.upgrades.find((u) => u.id === id)
  confirmPurchase({
    title: `${info?.name ?? 'Uppgradering'} nivå ${levels[id] + 1}?`,
    detail: `${vehicle.name}: ${info?.blurb ?? ''}`,
    price: cost,
    coins: save.coins,
    onYes: () => {
      if (!spend(save, cost)) return
      save.levels[vehicle.id] = { ...levels, [id]: levels[id] + 1 }
      // A new level is driven straight away.
      setDrivenLevel(save, vehicle.id, id, levels[id] + 1)
      persist()
      sound.fanfare()
      openGarage(id)
    },
  })
}

function openSettings(): void {
  showSettings(
    settingsEl,
    settings,
    () => {
      saveSettings(settings)
      sound.setVolume(settings.volume, settings.sound)
      applyMusic()
    },
    () => {
      cloud.leave()
      Object.assign(save, emptySave())
      writeSave(save)
      clearGhosts()
      run = newRun()
      prev = next = run.sim.state()
      renderer.resetCamera(next)
    },
    goHome,
    cloud,
    () => {
      // A fresh highscore board: bests, times, scores and ghosts go; coins and upgrades stay.
      save.scores = []
      save.playerBest = {}
      save.playerTimes = {}
      save.best = {}
      writeSave(save)
      clearGhosts()
    },
  )
  show('settings')
}

function openTuning(): void {
  showTuning(tuneEl, {
    sandbox,
    vehicles: VEHICLES.map((v) => ({ id: v.id, name: v.name, upgrades: v.upgrades, preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base) })),
    tracks: ENVIRONMENTS.map((e) => ({ id: e.id, name: e.name })),
    modes: MODES.map((m) => ({ id: m.id, name: m.name })),
    ownLevels: (id) => drivenLevels(save, id),
    onChange: () => saveSandbox(sandbox),
    onDrive: startSandbox,
    onBack: goHome,
  })
  show('tuning')
}

/** A test drive from Trimning: any vehicle, track and tuning; nothing about it counts. */
function startSandbox(): void {
  sandboxRun = true
  daily = null
  cup = null
  startRun()
}

/** Start a round with the ticked players, first player first. */
function startRound(): void {
  if (!save.players.length) return
  // A round from the menus always drives the family's own vehicles and upgrades.
  sandboxRun = false
  // Same track and mode as the round before: keep everyone's latest run from it as a ghost.
  round = nextRound(round, save.players, currentKey())
  // With several players, first show who starts, the order, and let them pick a vehicle.
  if (!together(round)) return startRun()
  openTurn()
}

/** Before a turn in a round with several players: whose turn it is and their vehicle. */
function openTurn(): void {
  const me = currentPlayer()
  const mine = playerVehicle(me)
  showTurn(resultsEl, {
    players: round.players.map((name) => ({ name, colour: playerColour(name) })),
    turn: round.turn,
    info: daily || cup ? trackName() : `${currentEnv().name} · ${currentMode().name}`,
    // Today's challenge sets the vehicle for everyone.
    vehicles: (daily ? [driveVehicle()] : VEHICLES.filter((v) => owned(v.id, v.price))).map((v) => ({
      id: v.id, name: v.name, selected: daily ? true : v.id === mine.id,
      preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base, playerColour(me)),
    })),
    onVehicle: (id) => {
      if (daily) return
      save.playerVehicles = { ...save.playerVehicles, [me]: id }
      writeSave(save)
      openTurn()
    },
    onGo: () => startRun(),
  })
  show('results')
}

/**
 * Ghosts for this turn: the player's own best and last runs on this track, and the best run of
 * the others in the round.
 */
function pickGhosts(): void {
  collectGhosts()
  // The ghost setting: all of them, only records, or none.
  if (settings.ghosts === 'off') ghosts = []
  else if (settings.ghosts === 'records') ghosts = ghosts.filter((g) => /rekord/i.test(g.label))
}

function collectGhosts(): void {
  const env = currentKey()
  const me = currentPlayer()
  ghosts = []
  // Each run shows once, under the first label it gets.
  const add = (g: ReturnType<typeof loadGhost>, label: string) => {
    const dup = (x: Ghost) => !!g && x.player === g.player && x.distance === g.distance && x.time === g.time && x.data.length === g.data.length
    if (g && g.data.length && !ghosts.some((x) => dup(x.track.ghost))) ghosts.push({ label, colour: playerColour(g.player), track: new GhostTrack(g) })
  }
  // A round with several players: everyone's latest run and record, and the overall record.
  if (together(round)) {
    const vehicleBest = loadGhost(me, vehicleKey(env, driveVehicle().id), 'best')
    const driver = { player: me, vehicleBest, vehicleName: driveVehicle().name }
    for (const g of roundGhosts(round.players, PLAYERS.map((p) => p.name), round.ghosts, round.previous, (p, kind) => loadGhost(p, env, kind), driver)) add(g.ghost, g.label)
    return
  }
  const best = loadGhost(me, env, 'best')
  const last = loadGhost(me, env, 'last')
  add(best, `${me} rekord`)
  // Your record in the vehicle you are driving, when it is not your overall record.
  const vbest = loadGhost(me, vehicleKey(env, driveVehicle().id), 'best')
  add(vbest, `${me} rekord · ${driveVehicle().name}`)
  add(last, `${me} senaste`)
  const others = round.players.filter((p) => p !== me).map((p) => loadGhost(p, env, 'best')).filter((g) => g !== null)
  const rank = (g: { time?: number; distance: number }) => (currentMode().length ? (g.time ?? Infinity) : -g.distance)
  const top = others.sort((a, b) => rank(a) - rank(b) || b.distance - a.distance)[0]
  if (top) add(top, `${top.player} rekord`)
}

function startRun(): void {
  // Time of day and weather come with today's challenge only (the date picks them).
  atmosphere = daily ? today().atmosphere : undefined
  sound.setVehicle(driveVehicle().id)
  run = newRun()
  pickGhosts()
  recorder = new GhostRecorder(run.options.vehicle.wheels.length)
  recorder.sample(run.sim.state())
  prev = next = run.sim.state()
  popups = []
  renderer.resetCamera(next)
  // The 3-2-1 countdown: the vehicle is held and the engine can be revved (sim/launch.ts).
  countdown = 3 * LAUNCH.beat
  bogLeft = 0
  bogStarted = false
  revs = new EngineRevs(run.options.vehicle.engine.revTime)
  sound.beep(false)
  show('driving')
}

function finishRun(): void {
  if (mode !== 'driving' && mode !== 'ending') return
  // Ending a run by hand pays a combo in progress.
  if (run.status === 'running') run.endCombo()
  const total = run.totalCoins
  const distance = run.endDistance ?? next.distance
  const envId = recordEnvId()
  const race = currentMode()
  const key = currentKey()
  const me = currentPlayer()
  const best = playerBest(save, me, envId)
  const time = run.finishTime ?? undefined
  const bestTime = playerTime(save, me, key)
  // Test drives from Trimning never count: no coins, bests, highscores, ghosts or missions.
  const counts = !sandboxRun
  if (counts) earn(save, total)
  if (counts) {
    save.best[envId] = Math.max(save.best[envId] ?? 0, distance)
    save.playerBest[me] = { ...save.playerBest[me], [envId]: Math.max(best, distance) }
    if (time !== undefined) save.playerTimes[me] = { ...save.playerTimes[me], [key]: Math.min(bestTime, time) }
    addScore(save, { name: me, vehicle: driveVehicle().id, env: envId, distance, mode: race.id, time })
  }
  // Missions done in this run pay their coins and make way for new ones.
  const missionsDone = counts ? checkMissions(me, { ...run.stats, distance, env: currentEnv().id, coins: total }) : []
  persist()
  // Every counting run is kept as the player's last ghost (and best, if it went further or faster).
  let turnGhost: Ghost | null = null
  if (distance > 0) {
    const ghost = recorder.finish({ player: me, vehicle: driveVehicle().id, env: key, distance, time })
    if (counts) {
      storeGhost(ghost)
      storeVehicleBest(ghost)
    }
    // Raced by the players after this one in the round (a retake replaces the earlier run).
    turnGhost = ghost
  }
  const newBest = counts && (race.length ? time !== undefined && time < bestTime : distance > best)
  // A test drive is not a turn in the round.
  if (counts) recordTurn(round, { name: me, vehicle: driveVehicle().name, distance, time, newBest }, turnGhost)
  const nextPlayer = counts ? nextPlayerOf(round) : undefined
  showResults(resultsEl, {
    status: run.status === 'running' ? 'ended' : run.status,
    distance,
    newBest: counts && distance > best,
    race: race.length ? { length: race.length, time, newBestTime: newBest } : undefined,
    coins: run.coins,
    total,
    bank: save.coins,
    player: { name: me, colour: playerColour(me) },
    missions: missionsDone,
    next: nextPlayer,
    roundOver: counts && roundOver(round),
    sandbox: !counts,
    onGarage: counts ? goHome : openTuning,
    onAgain: counts ? startRound : startSandbox,
    onNext: () => {
      advance(round)
      openTurn()
    },
    onStandings: openStandings,
  })
  show('results')
}

/** The round's results, furthest first; then back to the garage or another round. */
function openStandings(): void {
  // The family table: every round with several players has a winner (ties go to the first).
  const winner = standings(round)[0]?.name
  if (winner && together(round)) {
    save.roundWins = [...(save.roundWins ?? []), { at: Date.now(), winner }].slice(-2000)
    persist()
  }
  showStandings(resultsEl, {
    track: cup ? `${currentEnv().name}${currentMode().length ? ` · ${currentMode().name}-lopp` : ''}` : daily ? trackName() : currentMode().length ? `${currentEnv().name} · ${currentMode().name}-lopp` : currentEnv().name,
    // Races: finishers by time, then the rest by how far they got. Endless: by distance.
    rows: standings(round)
      .map((r) => ({
        name: r.name,
        colour: playerColour(r.name),
        vehicle: r.vehicle,
        newBest: r.newBest,
        result: r.time !== undefined ? formatTime(r.time) : currentMode().length ? `Ej i mål · ${Math.floor(r.distance)} m` : `${Math.floor(r.distance)} m`,
      })),
    cup: cupView(),
    onHome: () => {
      cup = null
      goHome()
    },
    onAgain: () => (cup ? startCup() : startRound()),
    onNextTrack: () => {
      if (!cup) return
      cup.index++
      startRound()
    },
  })
  show('results')
}

/** A player's outfit: their colour on the helmet, and the pattern and hat they picked. */
function outfitFor(name: string): Outfit {
  return { colour: playerColour(name), ...DEFAULT_OUTFIT, ...save.outfits?.[name] }
}

/** Utstyrsel: pick (and buy) each player's helmet pattern and hat. */
function openOutfit(name: string): void {
  const mine = outfitFor(name)
  const has = (kind: string, id: string, price: number) => price === 0 || save.unlocked.includes(`${kind}:${id}`)
  showOutfit(scoresEl, {
    coins: save.coins,
    players: PLAYERS.map((p) => ({ name: p.name, colour: p.colour, on: p.name === name })),
    preview: (c) => {
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.save()
      ctx.translate(c.width / 2, c.height * 0.62)
      ctx.scale(95, -95)
      setOutfit(mine)
      drawHead(ctx, 1, 'happy')
      setOutfit(null)
      ctx.restore()
    },
    hats: HATS.map((h) => ({ ...h, owned: has('hat', h.id, h.price), on: mine.hat === h.id })),
    patterns: PATTERNS.map((p) => ({ ...p, owned: has('pattern', p.id, p.price), on: mine.pattern === p.id })),
    onPlayer: openOutfit,
    onItem: (kind, id) => {
      const item = (kind === 'hat' ? HATS : PATTERNS).find((x) => x.id === id)
      if (!item) return
      if (!has(kind, id, item.price)) {
        if (item.price < 0) return
        if (!spend(save, item.price)) return
        save.unlocked.push(`${kind}:${id}`)
      }
      save.outfits = { ...save.outfits, [name]: { pattern: mine.pattern, hat: mine.hat, [kind]: id } as { pattern: Pattern; hat: Hat } }
      persist()
      openOutfit(name)
    },
    onBack: () => openGarage(),
  })
  show('scores')
}

/** A player's three missions, topped up on maps the family owns. */
function missionsFor(name: string): Mission[] {
  save.missions ??= {}
  const maps = ENVIRONMENTS.filter((e) => owned(e.id, e.price)).map((e) => e.id)
  return (save.missions[name] = fillMissions(save.missions[name] ?? [], maps))
}

/** Pay and replace the missions a run completed; returns them for the results screen. */
function checkMissions(name: string, stats: RunStats): { text: string; reward: number }[] {
  const all = missionsFor(name)
  const finished = all.filter((m) => done(m, stats))
  if (!finished.length) return []
  for (const m of finished) earn(save, m.reward)
  save.missions![name] = all.filter((m) => !finished.includes(m))
  missionsFor(name)
  return finished.map((m) => ({ text: describe(m, (id) => environment(id).name), reward: m.reward }))
}

/** A hidden star: coins and a fanfare; all three on a map pay a bonus and the gold-star pattern. */
function foundStar(id: string, x: number, y: number): void {
  sound.fanfare()
  sound.coin()
  renderer.cheer()
  renderer.sparkle(x, y, '#ffd23f')
  // A test drive finds nothing for real.
  if (sandboxRun || save.unlocked.includes(id)) {
    popups.push({ text: '★ Stjärna!', age: 0 })
    return
  }
  save.unlocked.push(id)
  earn(save, STAR_COINS)
  popups.push({ text: `★ Stjärna!  +${STAR_COINS}`, age: 0 })
  const all = starsFor(currentEnv())
  if (all.every((s) => save.unlocked.includes(s.id))) {
    earn(save, ALL_STARS_COINS)
    popups.push({ text: `Alla stjärnor på ${currentEnv().name}!  +${ALL_STARS_COINS}`, age: 0 })
    if (!save.unlocked.includes('pattern:goldstars')) {
      save.unlocked.push('pattern:goldstars')
      popups.push({ text: 'Nytt hjälmmönster: Guldstjärnor!', age: 0 })
    }
  }
  persist()
}

/** Watch a player's record on a track (its stored best ghost) with the camera following it. */
function startReplay(name: string, key: string, back: () => void): void {
  const g = loadGhost(name, key, 'best')
  if (!g) return
  const track = new GhostTrack(g)
  const first = track.at(0)
  replay = { track, t: 0, env: key.split('.')[0], startX: first?.chassis.x ?? 0, spec: vehicleEntry(g.vehicle).base, player: name, back }
  run = newRun()
  prev = next = poseToState(first!, replay.startX)
  renderer.resetCamera(next)
  replayBar.querySelector('span')!.textContent = `Repris: ${name} · ${currentEnv().name} · ${g.time !== undefined ? formatTime(g.time) : `${Math.floor(g.distance)} m`}`
  show('replay')
}

function endReplay(): void {
  const back = replay?.back
  replay = null
  run = newRun()
  prev = next = run.sim.state()
  renderer.resetCamera(next)
  back?.()
}

/**
 * Duell: the first two ticked players race at the same time on a split screen, the first on the
 * top half and the second on the bottom half, each with their own vehicle and pedals at the edges
 * of their half. Same track and mode as the garage. Coins, bests and highscores count as usual
 * (no ghosts are recorded); the engine you hear is the top player's.
 */
interface DuelSide {
  player: string
  run: Run
  prev: SimState
  next: SimState
  revs: EngineRevs
  input: Input
  renderer: GameRenderer
  popups: Popup[]
}
let duel: { sides: DuelSide[]; countdown: number; acc: number; endTimer: number } | null = null

function startDuel(): void {
  if (save.players.length < 2) return
  daily = null
  cup = null
  sandboxRun = false
  const names = save.players.slice(0, 2)
  round = emptyRound(names)
  const sides = names.map((player, i) => {
    round.turn = i
    const r = newRun()
    const s = r.sim.state()
    return { player, run: r, prev: s, next: s, revs: new EngineRevs(r.options.vehicle.engine.revTime), input: i === 0 ? controls.input : controls2.input, renderer: i === 0 ? renderer : renderer2, popups: [] as Popup[] }
  })
  round.turn = 0
  sound.setVehicle(driveVehicle().id)
  for (const side of sides) {
    side.renderer.resetCamera(side.next)
  }
  atmosphere = undefined
  duel = { sides, countdown: 3 * LAUNCH.beat, acc: 0, endTimer: 1.2 }
  sound.beep(false)
  show('duel')
}

function stepDuel(dt: number): void {
  const d = duel!
  if (d.countdown > 0) {
    const beat = Math.ceil(d.countdown / LAUNCH.beat)
    d.countdown -= dt
    for (const side of d.sides) side.revs.free(side.input.gas, dt)
    if (d.countdown <= 0) {
      sound.beep(true)
      for (const side of d.sides) side.renderer.launch(side.run.launch(side.revs.revs))
    } else if (Math.ceil(d.countdown / LAUNCH.beat) !== beat) sound.beep(false)
    return
  }
  d.acc += dt
  while (d.acc >= STEP) {
    for (const side of d.sides) {
      side.prev = side.next
      const wasRunning = side.run.status === 'running'
      side.run.step(side.input)
      side.next = side.run.sim.state()
      for (const e of side.run.events) {
        if (e.kind === 'coin') {
          side.popups.push({ text: `+${e.value}`, at: { x: e.x, y: e.y }, age: 0 })
          if (side === d.sides[0]) sound.coin()
        } else if (e.kind === 'flip') side.popups.push({ text: `${e.direction === 'back' ? 'Bakåtvolt' : 'Framåtvolt'}!  +${e.value}`, age: 0 })
        else if (e.kind === 'fuel') side.popups.push({ text: 'Bränsle!', at: { x: e.x, y: e.y }, age: 0 })
      }
      if (wasRunning && side.run.status === 'crashed') {
        sound.crash()
        side.renderer.shake(1)
      } else if (wasRunning && side.run.status === 'finished') side.renderer.cheer()
    }
    d.acc -= STEP
  }
  // Both done: a moment to see it, then the result.
  if (d.sides.every((s) => s.run.status !== 'running') && (d.endTimer -= dt) <= 0) finishDuel()
}

function drawDuel(dt: number): void {
  const d = duel!
  const top = d.sides[0]
  const shown = d.countdown > 0 ? top.revs.revs : top.revs.follow(top.next.revs, dt)
  sound.engine(shown, top.input.gas && top.run.fuel > 0 && !top.next.shifting, top.run.status === 'running' && top.run.fuel > 0 && !paused)
  for (const side of d.sides) {
    side.popups = side.popups.filter((p) => (p.age += dt) < (p.at ? 0.9 : 1.6))
    const r = side.run
    const revsNow = d.countdown > 0 ? side.revs.revs : side.next.revs
    side.renderer.draw({
      prev: side.prev,
      next: side.next,
      alpha: d.countdown > 0 ? 1 : d.acc / STEP,
      spec: r.options.vehicle,
      height: r.options.height,
      env: currentEnv(),
      dt,
      input: side.input,
      pickups: r.options.pickups.items,
      wheelie: r.wheelieNow,
      combo: null,
      fuel: r.fuel,
      runCoins: r.totalCoins,
      popups: side.popups,
      showPedals: true,
      swapPedals: settings.swapPedals,
      driver: { lean: r.sway.lean, ragdoll: r.ragdoll?.poses() ?? null },
      player: { name: side.player, colour: playerColour(side.player) },
      outfit: outfitFor(side.player),
      ghosts: [],
      puddles: puddlesFor(currentEnv()),
      race: currentMode().length ? { length: currentMode().length!, time: r.finishTime ?? r.sim.steps * STEP } : undefined,
      showHud: true,
      revs: revsNow,
      countdown: d.countdown > 0 ? d.countdown : undefined,
    })
  }
}

/** The duel's result: both runs count like ordinary runs; the further (or faster) wins. */
function finishDuel(): void {
  const d = duel
  if (!d) return
  duel = null
  const envId = currentEnv().id
  const race = currentMode()
  const key = currentKey()
  // A duel always counts (test drives only come from Trimning).
  const results = d.sides.map((side, i) => {
    round.turn = i
    const r = side.run
    r.endCombo()
    const distance = r.endDistance ?? side.next.distance
    const time = r.finishTime ?? undefined
    earn(save, r.totalCoins)
    const newBest = (race.length ? time !== undefined && time < playerTime(save, side.player, key) : distance > playerBest(save, side.player, envId))
    save.best[envId] = Math.max(save.best[envId] ?? 0, distance)
    save.playerBest[side.player] = { ...save.playerBest[side.player], [envId]: Math.max(playerBest(save, side.player, envId), distance) }
    if (time !== undefined) save.playerTimes[side.player] = { ...save.playerTimes[side.player], [key]: Math.min(playerTime(save, side.player, key), time) }
    addScore(save, { name: side.player, vehicle: driveVehicle().id, env: envId, distance, mode: race.id, time })
    return { name: side.player, vehicle: driveVehicle().name, distance, time, newBest, coins: r.totalCoins }
  })
  round.turn = 0
  persist()
  const ranked = [...results].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || b.distance - a.distance)
  const tie = ranked[0].time === ranked[1].time && ranked[0].distance === ranked[1].distance
  show('results')
  showStandings(resultsEl, {
    heading: tie ? '⚔ Oavgjort!' : `⚔ ${ranked[0].name} vinner duellen!`,
    track: `${currentEnv().name}${race.length ? ` · ${race.name}-lopp` : ''}`,
    rows: ranked.map((r) => ({
      name: r.name,
      colour: playerColour(r.name),
      vehicle: `${r.vehicle} · ● ${r.coins}`,
      newBest: r.newBest,
      result: r.time !== undefined ? formatTime(r.time) : race.length ? `Ej i mål · ${Math.floor(r.distance)} m` : `${Math.floor(r.distance)} m`,
    })),
    onHome: goHome,
    onAgain: startDuel,
  })
}

/** Note the cup winners in the family table, and pass them on. */
function recordCupWin(winners: string[]): string[] {
  save.cupWins = [...(save.cupWins ?? []), ...winners.map((winner) => ({ at: Date.now(), winner }))]
  persist()
  return winners
}

/** The family table for Topplista: wins per player, and the most round wins in the last seven days. */
function familyTable() {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const rows = PLAYERS.map((p) => ({
    name: p.name,
    colour: p.colour,
    rounds: (save.roundWins ?? []).filter((w) => w.winner === p.name).length,
    cups: (save.cupWins ?? []).filter((w) => w.winner === p.name).length,
    week: (save.roundWins ?? []).filter((w) => w.winner === p.name && w.at >= weekAgo).length,
  }))
  const best = Math.max(...rows.map((r) => r.week))
  const top = rows.filter((r) => r.week === best && best > 0)
  return { rows: [...rows].sort((a, b) => b.rounds - a.rounds), weekWinner: top.length === 1 ? top[0].name : undefined }
}

/** Start a tournament on three of the family's maps, with the ticked players. */
function startCup(): void {
  daily = null
  cup = newCup(ENVIRONMENTS.filter((e) => owned(e.id, e.price)).map((e) => e.id), save.players)
  startRound()
}

/** After a tournament track: score it and show the points so far (and the winners after the last). */
function cupView() {
  if (!cup) return undefined
  scoreTrack(cup, standings(round))
  const last = lastTrack(cup)
  return {
    title: `Tävling · bana ${cup.index + 1} av ${CUP_TRACKS}`,
    table: cupTable(cup).map((t) => ({ ...t, colour: playerColour(t.name) })),
    nextTrack: last ? undefined : environment(cup.tracks[cup.index + 1]).name,
    winners: last ? recordCupWin(cupWinners(cup)) : undefined,
  }
}

endRunBtn.addEventListener('click', () => (mode === 'duel' ? finishDuel() : finishRun()))
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && mode === 'driving') startRun()
  if (e.code === 'KeyH' && mode === 'driving') sound.horn(driveVehicle().id)
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'garage') startRound()
})
// Bank the run's coins if the page is closed or hidden mid-run.
document.addEventListener('visibilitychange', () => {
  // Interrupted (a call, the home button): pause rather than end the run.
  if (document.hidden && (mode === 'driving' || mode === 'duel')) pause()
})

let wasAirborne = false
let wasInPuddle = false
function handleEvents(): void {
  const s = run.sim.state()
  if (wasAirborne && !s.airborne) sound.land(Math.abs(run.sim.vehicle.chassis.getLinearVelocity().y) / 15)
  wasAirborne = s.airborne
  // A splash sound as a wheel goes into a puddle.
  const inPuddle = run.sim.vehicle.wheels.some((_, i) => run.sim.puddleUnder(i) !== null)
  if (inPuddle && !wasInPuddle && Math.abs(s.speed) > 2) sound.splash(Math.min(1, Math.abs(s.speed) / 12))
  wasInPuddle = inPuddle
  if (s.gear !== prev.gear && mode === 'driving') {
    sound.shift(s.gear > prev.gear, s.revs)
    renderer.gearShift(s.gear > prev.gear)
  }
  for (const e of run.events) {
    if (e.kind === 'coin') sound.coin()
    else if (e.kind === 'fuel') sound.fuel()
    else if (e.kind === 'star') foundStar(e.id, e.x, e.y)
    else if (e.kind === 'turbo') {
      sound.turbo()
      popups.push({ text: 'Turbo!', at: { x: e.x, y: e.y }, age: 0 })
      renderer.sparkle(e.x, e.y, '#7fc4ff')
    }
    else if (e.kind === 'flip' || e.kind === 'milestone' || e.kind === 'air' || e.kind === 'wheelie' || e.kind === 'combo' || e.kind === 'stunt') {
      sound.fanfare()
      renderer.cheer()
    }
  }
  for (const e of run.events) {
    if (e.kind === 'coin') {
      popups.push({ text: `+${e.value}`, at: { x: e.x, y: e.y }, age: 0 })
      renderer.sparkle(e.x, e.y)
      renderer.coinCollected(e.x, e.y)
    } else if (e.kind === 'fuel') {
      // A rescue gets its own big banner (renderer.fuelRescue); a normal can a small popup.
      if (!e.bonus) popups.push({ text: 'Bränsle!', at: { x: e.x, y: e.y }, age: 0 })
      if (e.bonus) {
        sound.fanfare()
        sound.coin()
        renderer.cheer()
        renderer.fuelRescue(e.x, e.y, e.bonus)
      } else renderer.sparkle(e.x, e.y, '#ff9a9a')
    }
    else if (e.kind === 'air') popups.push({ text: `Luft ${e.seconds.toFixed(1).replace('.', ',')} s  +${e.value}`, age: 0 })
    else if (e.kind === 'wheelie') popups.push({ text: `Stegring ${Math.floor(e.metres)} m${e.multiplier > 1 ? ` ×${e.multiplier}` : ''}  +${e.value}`, age: 0 })
    else if (e.kind === 'flip') {
      const name = ['', '', 'Dubbel ', 'Trippel ', 'Fyrdubbel '][e.flips] ?? `${e.flips}× `
      popups.push({ text: `${name}${e.direction === 'back' ? 'bakåtvolt' : 'framåtvolt'}!  +${e.value}`, age: 0 })
    }
    else if (e.kind === 'milestone') popups.push({ text: `${e.distance} m  +${e.value}`, age: 0 })
    else if (e.kind === 'stunt') {
      popups.push({ text: `${e.what === 'loop' ? 'Loop!' : 'Över gropen!'}  +${e.value}`, age: 0 })
      renderer.sparkle(e.x, e.y, '#ffd23f')
    }
    else if (e.kind === 'combo') popups.push({ text: `Kombo ${e.tricks} trick ×${String(e.multiplier).replace('.', ',')}  +${e.value}`, age: 0 })
    else if (e.kind === 'comboLost' && e.tricks >= 2) popups.push({ text: 'Kombon tappad!', age: 0 })
  }
}

let last = performance.now()
let accumulator = 0

function frame(now: number): void {
  updateViewport()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (paused) {
    // Nothing moves while paused.
  } else if (mode === 'duel' && duel) {
    stepDuel(dt)
  } else if (mode === 'replay' && replay) {
    // A replay: the recorded poses drive the vehicle; the camera follows; back when it ends.
    replay.t += dt
    const pose = replay.track.at(replay.t)
    if (pose) {
      prev = next
      next = poseToState(pose, replay.startX, prev)
    }
    if (replay.t > replay.track.duration + 1.5) endReplay()
  } else if (mode === 'driving' && countdown > 0) {
    const beat = Math.ceil(countdown / LAUNCH.beat)
    countdown -= dt
    revs.free(controls.input.gas, dt)
    if (countdown <= 0) {
      const kind = run.launch(revs.revs)
      sound.beep(true)
      if (kind === 'perfect') sound.fanfare()
      else if (kind === 'over') sound.wheelspin()
      else bogLeft = LAUNCH.bogSeconds
      renderer.launch(kind)
    } else if (Math.ceil(countdown / LAUNCH.beat) !== beat) sound.beep(false)
  } else if (mode === 'driving' || mode === 'ending') {
    accumulator += dt
    while (accumulator >= STEP) {
      prev = next
      run.step({ ...controls.input, boost: boosting })
      next = run.sim.state()
      if (run.status === 'running') recorder.sample(next)
      handleEvents()
      accumulator -= STEP
    }
    if (mode === 'driving' && run.status !== 'running') {
      if (run.status === 'crashed') {
        sound.crash()
        renderer.shake(1)
      } else if (run.status === 'finished') {
        sound.fanfare()
        renderer.cheer()
      }
      // Let the crash or the final roll show for a moment before the results.
      mode = 'ending'
      endTimer = 1.2
      endRunBtn.classList.add('hidden')
    }
    if (mode === 'ending' && (endTimer -= dt) <= 0) finishRun()
  }
  popups = popups.filter((p) => (p.age += dt) < (p.at ? 0.9 : 1.6))
  // The engine dies with the tank; it rolls on in silence.
  // Rocket roar while the thrusters fire.
  if (mode === 'driving' && !paused && boosting && run.thrustLeft > 0 && (thrustSound -= dt) <= 0) {
    sound.thrust()
    thrustSound = 0.12
  }
  // Shown and heard revs: free revving in the countdown, else chasing the wheels at the engine's pace.
  // A bog (revs below the green at GO): the revs sag low and chug before they pick up.
  if (bogLeft > 0 && mode === 'driving') {
    if (controls.input.gas && !bogStarted) {
      bogStarted = true
      sound.bog()
    }
    if (bogStarted) bogLeft -= dt
  }
  const sag = bogStarted && bogLeft > 0 ? 0.08 + 0.3 * (1 - bogLeft / LAUNCH.bogSeconds) : 1
  const shownRevs = countdown > 0 ? revs.revs : revs.follow(Math.min(next.revs, sag), dt)
  if (mode === 'duel' && duel) {
    drawDuel(dt)
    requestAnimationFrame(frame)
    return
  }
  sound.engine(shownRevs, controls.input.gas && run.fuel > 0 && !next.shifting, mode === 'driving' && run.fuel > 0 && !paused)
  renderer.draw({
    prev,
    next,
    alpha: mode === 'driving' || mode === 'ending' ? accumulator / STEP : 1,
    spec: mode === 'replay' && replay ? replay.spec : run.options.vehicle,
    height: run.options.height,
    env: currentEnv(),
    dt,
    input: controls.input,
    pickups: run.options.pickups.items,
    wheelie: mode === 'driving' ? run.wheelieNow : null,
    turbo: mode === 'driving' ? run.turboLeft / RULES.turboSeconds : 0,
    stars: mode === 'driving' || mode === 'ending' ? (run.options.stars ?? []).filter((s) => !run.starsFound.includes(s.id)) : [],
    thrust: mode === 'driving' && run.options.vehicle.thrusters ? { left: run.thrustLeft / run.options.vehicle.thrusters.seconds, on: boosting && run.thrustLeft > 0 } : undefined,
    combo: mode === 'driving' && run.combo && run.combo.tricks >= 2 ? { tricks: run.combo.tricks, multiplier: RULES.comboMultiplier(run.combo.tricks) } : null,
    atmosphere: mode === 'driving' || mode === 'ending' || mode === 'results' ? atmosphere : undefined,
    nextFuel: (() => {
      const at = run.options.pickups.nextFuel(next.chassis.x)
      return at === null ? null : at - next.chassis.x
    })(),
    fuel: run.fuel,
    runCoins: run.totalCoins,
    popups,
    showPedals: mode === 'driving',
    swapPedals: settings.swapPedals,
    driver: { lean: run.sway.lean, ragdoll: run.ragdoll?.poses() ?? null },
    player: mode === 'replay' && replay ? { name: replay.player, colour: playerColour(replay.player) } : mode === 'driving' || mode === 'ending' ? { name: sandboxRun ? `${currentPlayer()} · 🔧 test` : currentPlayer(), colour: playerColour(currentPlayer()) } : undefined,
    outfit: outfitFor(mode === 'replay' && replay ? replay.player : currentPlayer()),
    ghosts: mode === 'driving' || mode === 'ending' ? ghostPoses() : [],
    puddles: puddlesFor(currentEnv()),
    seesaws: currentEnv().stunt ? run.sim.seesawAngles() : undefined,
    race: currentMode().length ? { length: currentMode().length!, time: run.finishTime ?? run.sim.steps * STEP } : undefined,
    showHud: mode === 'driving' || mode === 'ending' || mode === 'results',
    revs: shownRevs,
    countdown: mode === 'driving' ? countdown : undefined,
  })
  requestAnimationFrame(frame)
}

/** Where each raced ghost is at this moment of the run. */
function ghostPoses() {
  const alpha = accumulator / STEP
  const t = Math.max(0, (run.sim.steps - 1 + alpha) * STEP)
  return ghosts.flatMap((g) => {
    const pose = g.track.at(t)
    return pose && pose.fade > 0 ? [{ label: g.label, colour: g.colour, spec: vehicleEntry(g.track.ghost.vehicle).base, pose, outfit: outfitFor(g.track.ghost.player) }] : []
  })
}

// Sync on start and whenever the game comes back to the front; refresh the garage when another
// device's progress arrives.
cloud.onMerged = () => {
  if (mode === 'garage') openGarage()
}
void cloud.syncNow()
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void cloud.syncNow()
})

// Development only: lets screenshot scripts trigger effects without playing to them.
if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { renderer, get run() { return run }, set atmosphere(a: Atmosphere) { atmosphere = a } }

// Offline play and home-screen install (published builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined)
}

openGarage()
renderer.resetCamera(next)
requestAnimationFrame(frame)
