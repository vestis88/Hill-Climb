import { EngineRevs, LAUNCH } from './sim/launch'
import { dailyFor, dateKey, oldDaily } from './data/daily'
import { ENVIRONMENTS, environment, heightFor, puddlesFor } from './data/environments'
import { PickupField } from './data/track'
import { VEHICLES, vehicleEntry } from './data/vehicles'
import { applyUpgrades, BASE_LEVELS, FULL_LEVELS, MAX_LEVEL, price, type UpgradeId } from './data/upgrades'
import { Sound } from './audio/sound'
import { createInput } from './input/input'
import { GameRenderer, type Popup } from './render/game'
import { drawEnvironmentPreview, drawVehiclePreview } from './render/preview'
import { addScore, earn, emptySave, levelsFor, loadSave, playerBest, playerTime, spend, writeSave } from './save/save'
import { clearGhosts, roundGhosts, GhostRecorder, GhostTrack, loadGhost, storeGhost, storeVehicleBest, vehicleKey, type Ghost } from './save/ghosts'
import { CloudSync } from './save/cloud'
import { PLAYERS, playerColour } from './data/players'
import { formatTime, gameMode, MODES, recordKey } from './data/modes'
import { Run } from './sim/run'
import type { SimState } from './sim/types'
import { STEP } from './sim/world'
import { showGarage, showResults, showScores, showStandings, showTurn } from './ui/screens'
import { loadSettings, saveSettings, showSettings } from './ui/settings'
import { trackViewport, updateViewport } from './ui/viewport'
import { loadTuning, showTuning, tuningEnabled, type DriveAs } from './ui/tuning'

trackViewport()
const $ = (id: string) => document.getElementById(id) as HTMLElement
const canvas = $('game') as HTMLCanvasElement
const garageEl = $('garage')
const resultsEl = $('results')
const scoresEl = $('scores')
const tuneEl = $('tune')
const settingsEl = $('settings')
const endRunBtn = $('endRun')

const settings = loadSettings()
const sound = new Sound()
sound.setVolume(settings.volume, settings.sound)
const controls = createInput(canvas, () => settings.swapPedals)
// Safari only allows sound after a tap; any first touch or click unlocks it.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => sound.unlock(), { capture: true })
const renderer = new GameRenderer(canvas)
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
const tuning = loadTuning()
let driveAs: DriveAs = 'mine'

type Mode = 'garage' | 'driving' | 'ending' | 'results' | 'tuning' | 'settings' | 'scores'
let mode: Mode = 'garage'
/** Today's challenge, when one of its two events is picked in the garage (not saved). */
let daily: 'race' | 'endless' | null = null
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
interface Round {
  players: string[]
  turn: number
  results: { name: string; vehicle: string; distance: number; time?: number; newBest: boolean }[]
  /** This round's runs, as ghosts for the players after them (kept in memory only). */
  ghosts: Ghost[]
  /** The runs from earlier rounds on this same track and mode, shown until the player drives again. */
  previous: Ghost[]
}
// Declared before the first run is created below, which reads them.
let round: Round = { players: [...save.players], turn: 0, results: [], ghosts: [], previous: [] }
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
  // Test mode (?tune in the address): everything is open, nothing is bought.
  return price === 0 || tuningEnabled() || save.unlocked.includes(id)
}
const today = () => dailyFor(new Date())
function currentEnv() {
  return daily ? today().env : environment(save.envId)
}
/** Where this track's records live: the map, or today's challenge ("daily-2026-11-12"). */
function recordEnvId(): string {
  return daily ? today().id : currentEnv().id
}
/** The track's name for screens: the map, or "Dagens lopp · Frostpasset". */
function trackName(): string {
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
  if (daily) return vehicleEntry(today()[daily].vehicle)
  return round.players.length > 1 ? playerVehicle(currentPlayer()) : currentVehicle()
}
function currentMode() {
  if (daily) return gameMode(daily === 'race' ? 'race500' : 'endless')
  return gameMode(save.modeId)
}
/** Where this track's records are kept in the current mode (bests, ghosts, scores). */
function currentKey(): string {
  return recordKey(recordEnvId(), currentMode().id)
}
function currentPlayer(): string {
  return round.players[round.turn] ?? save.players[0] ?? PLAYERS[0].name
}

function vehicleSpec() {
  const entry = driveVehicle()
  const levels = daily ? today()[daily].levels : driveAs === 'base' ? BASE_LEVELS : driveAs === 'full' ? FULL_LEVELS : levelsFor(save, entry.id)
  // The tuning sandbox edits the starter car; other vehicles use their own data.
  const [base, full] = entry.id === 'runabout' ? [tuning.base, tuning.full] : [entry.base, entry.full]
  return applyUpgrades(base, full, levels)
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
    pickups: new PickupField(height, env.seed),
    // Distance bonuses count from this player's own best.
    bestDistance: playerBest(save, currentPlayer(), recordEnvId()),
    finish: currentMode().length,
  })
}

function show(m: Mode): void {
  mode = m
  garageEl.classList.toggle('hidden', m !== 'garage')
  resultsEl.classList.toggle('hidden', m !== 'results')
  scoresEl.classList.toggle('hidden', m !== 'scores')
  tuneEl.classList.toggle('hidden', m !== 'tuning')
  settingsEl.classList.toggle('hidden', m !== 'settings')
  endRunBtn.classList.toggle('hidden', m !== 'driving')
  controls.reset()
}

function openGarage(justBought?: UpgradeId): void {
  const vehicle = currentVehicle()
  showGarage(garageEl, {
    coins: save.coins,
    vehicleName: vehicle.name,
    upgrades: vehicle.upgrades,
    levels: levelsFor(save, vehicle.id),
    vehicles: VEHICLES.map((v) => ({
      id: v.id, name: v.name, blurb: v.blurb, price: v.price,
      owned: owned(v.id, v.price), selected: v.id === vehicle.id,
      preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base),
    })),
    environments: ENVIRONMENTS.map((e) => ({
      id: e.id, name: e.name, blurb: e.blurb, price: e.price,
      owned: owned(e.id, e.price), selected: !daily && e.id === currentEnv().id,
      note: `Rekord ${Math.floor(save.best[e.id] ?? 0)} m`,
      preview: (c: HTMLCanvasElement) => drawEnvironmentPreview(c, e, heightFor(e)),
    })),
    onPick: pick,
    tuning: tuningEnabled(),
    testMode: tuningEnabled(),
    onBuy: buy,
    players: PLAYERS.map((p) => ({ name: p.name, colour: p.colour, on: save.players.includes(p.name) })),
    onTogglePlayer: togglePlayer,
    modes: MODES.map((m) => ({ id: m.id, name: m.name, on: !daily && m.id === currentMode().id })),
    dailyTitle: `Dagens utmaning · ${today().env.name} · ${today().style}`,
    daily: (['race', 'endless'] as const).map((id) => {
      const d = today()
      const v = vehicleEntry(d[id].vehicle)
      const key = recordKey(d.id, id === 'race' ? 'race500' : 'endless')
      const results = PLAYERS.map((p) => ({ name: p.name, t: playerTime(save, p.name, key), m: playerBest(save, p.name, d.id) }))
      const leader = id === 'race' ? results.filter((r) => r.t < Infinity).sort((a, b) => a.t - b.t)[0] : results.filter((r) => r.m > 0).sort((a, b) => b.m - a.m)[0]
      return {
        id,
        name: id === 'race' ? 'Dagens lopp · 500 m' : 'Dagens oändliga',
        blurb: `${v.name}, trimmad för alla`,
        note: leader ? `Bäst idag: ${leader.name} ${id === 'race' ? formatTime(leader.t) : `${Math.floor(leader.m)} m`}` : 'Ingen har kört än',
        on: daily === id,
        preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base),
      }
    }),
    onDaily: (id) => {
      daily = id
      run = newRun()
      prev = next = run.sim.state()
      renderer.resetCamera(next)
      openGarage()
    },
    onMode: (id: string) => {
      daily = null
      save.modeId = id
      persist()
      openGarage()
    },
    onScores: () => openScores(recordEnvId(), currentMode().id),
    onDrive: startRound,
    onTune: openTuning,
    onSettings: openSettings,
    justBought,
  })
  show('garage')
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
    tracks: [...ENVIRONMENTS.map((e) => ({ id: e.id, name: e.name })), { id: d.id, name: 'Dagens' }],
    track: env.id,
    modes: modes.map((x) => ({ id: x.id, name: x.name })),
    mode: m.id,
    rows: save.scores
      .filter((s) => s.env === env.id && (s.mode ?? 'endless') === m.id)
      .map((s) => ({ name: s.name, colour: playerColour(s.name), vehicle: vehicleEntry(s.vehicle).name, result: s.time !== undefined ? formatTime(s.time) : m.length ? `Ej i mål · ${Math.floor(s.distance)} m` : `${Math.floor(s.distance)} m` })),
    bests: PLAYERS.map((p) => {
      const t = playerTime(save, p.name, key)
      return { name: p.name, colour: p.colour, result: m.length ? (t < Infinity ? formatTime(t) : '–') : `${Math.floor(playerBest(save, p.name, env.id))} m` }
    }),
    onTrack: (id) => openScores(id, m.id),
    onMode: (id) => openScores(env.id, id),
    onBack: () => openGarage(),
  })
  show('scores')
}

/** Select a vehicle or environment, buying it first if it is locked and affordable. */
function pick(kind: 'vehicle' | 'env', id: string): void {
  const item = kind === 'vehicle' ? vehicleEntry(id) : environment(id)
  if (!owned(item.id, item.price)) {
    if (!spend(save, item.price)) return
    save.unlocked.push(item.id)
  }
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

function buy(id: UpgradeId): void {
  const VEHICLE_ID = currentVehicle().id
  const levels = levelsFor(save, VEHICLE_ID)
  if (levels[id] >= MAX_LEVEL) return
  const cost = price(levels[id] + 1)
  if (!spend(save, cost)) return
  save.levels[VEHICLE_ID] = { ...levels, [id]: levels[id] + 1 }
  persist()
  sound.fanfare()
  openGarage(id)
}

function openSettings(): void {
  showSettings(
    settingsEl,
    settings,
    () => {
      saveSettings(settings)
      sound.setVolume(settings.volume, settings.sound)
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
    openGarage,
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
  showTuning(tuneEl, tuning, driveAs, (d) => {
    driveAs = d
    startRun()
  }, openGarage)
  show('tuning')
}

/** Start a round with the ticked players, first player first. */
function startRound(): void {
  if (!save.players.length) return
  // A round from the garage always drives with the family's own upgrades; the Tuning screen's
  // "Drive as" choice only applies to its own test drives.
  driveAs = 'mine'
  // Same track and mode as the round before: keep everyone's latest run from it as a ghost.
  const latest = [...round.previous.filter((p) => !round.ghosts.some((g) => g.player === p.player)), ...round.ghosts]
  round = { players: [...save.players], turn: 0, results: [], ghosts: [], previous: latest.filter((g) => g.env === currentKey()) }
  // With several players, first show who starts, the order, and let them pick a vehicle.
  if (round.players.length < 2) return startRun()
  openTurn()
}

/** Before a turn in a round with several players: whose turn it is and their vehicle. */
function openTurn(): void {
  const me = currentPlayer()
  const mine = playerVehicle(me)
  showTurn(resultsEl, {
    players: round.players.map((name) => ({ name, colour: playerColour(name) })),
    turn: round.turn,
    info: daily ? trackName() : `${currentEnv().name} · ${currentMode().name}`,
    // Today's challenge sets the vehicle for everyone.
    vehicles: (daily ? [driveVehicle()] : VEHICLES.filter((v) => owned(v.id, v.price))).map((v) => ({
      id: v.id, name: v.name, selected: daily ? true : v.id === mine.id,
      preview: (c: HTMLCanvasElement) => drawVehiclePreview(c, v.base),
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
  const env = currentKey()
  const me = currentPlayer()
  ghosts = []
  // Each run shows once, under the first label it gets.
  const add = (g: ReturnType<typeof loadGhost>, label: string) => {
    const dup = (x: Ghost) => !!g && x.player === g.player && x.distance === g.distance && x.time === g.time && x.data.length === g.data.length
    if (g && g.data.length && !ghosts.some((x) => dup(x.track.ghost))) ghosts.push({ label, colour: playerColour(g.player), track: new GhostTrack(g) })
  }
  // A round with several players: everyone's latest run and record, and the overall record.
  if (round.players.length > 1) {
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
  const total = run.totalCoins
  const distance = run.endDistance ?? next.distance
  const envId = recordEnvId()
  const race = currentMode()
  const key = currentKey()
  const me = currentPlayer()
  const best = playerBest(save, me, envId)
  const time = run.finishTime ?? undefined
  const bestTime = playerTime(save, me, key)
  earn(save, total)
  // Runs in test mode (everything unlocked) do not count: no bests, highscores or ghosts.
  const counts = !tuningEnabled()
  if (counts) {
    save.best[envId] = Math.max(save.best[envId] ?? 0, distance)
    save.playerBest[me] = { ...save.playerBest[me], [envId]: Math.max(best, distance) }
    if (time !== undefined) save.playerTimes[me] = { ...save.playerTimes[me], [key]: Math.min(bestTime, time) }
    addScore(save, { name: me, vehicle: driveVehicle().id, env: envId, distance, mode: race.id, time })
  }
  persist()
  // Every counting run is kept as the player's last ghost (and best, if it went further or faster).
  if (distance > 0) {
    const ghost = recorder.finish({ player: me, vehicle: driveVehicle().id, env: key, distance, time })
    if (counts) {
      storeGhost(ghost)
      storeVehicleBest(ghost)
    }
    // Raced by the players after this one in the round (a retake replaces the earlier run).
    round.ghosts = [...round.ghosts.filter((g) => g.player !== me), ghost]
  }
  const newBest = counts && (race.length ? time !== undefined && time < bestTime : distance > best)
  round.results.push({ name: me, vehicle: driveVehicle().name, distance, time, newBest })
  const nextPlayer = round.players[round.turn + 1]
  showResults(resultsEl, {
    status: run.status === 'running' ? 'ended' : run.status,
    distance,
    newBest: counts && distance > best,
    race: race.length ? { length: race.length, time, newBestTime: newBest } : undefined,
    coins: run.coins,
    total,
    bank: save.coins,
    player: { name: me, colour: playerColour(me) },
    next: nextPlayer,
    roundOver: !nextPlayer && round.players.length > 1,
    onGarage: openGarage,
    onAgain: startRound,
    onNext: () => {
      round.turn++
      openTurn()
    },
    onStandings: openStandings,
  })
  show('results')
}

/** The round's results, furthest first; then back to the garage or another round. */
function openStandings(): void {
  showStandings(resultsEl, {
    track: daily ? trackName() : currentMode().length ? `${currentEnv().name} · ${currentMode().name}-lopp` : currentEnv().name,
    // Races: finishers by time, then the rest by how far they got. Endless: by distance.
    rows: [...round.results]
      .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || b.distance - a.distance)
      .map((r) => ({
        name: r.name,
        colour: playerColour(r.name),
        vehicle: r.vehicle,
        newBest: r.newBest,
        result: r.time !== undefined ? formatTime(r.time) : currentMode().length ? `Ej i mål · ${Math.floor(r.distance)} m` : `${Math.floor(r.distance)} m`,
      })),
    onHome: () => openGarage(),
    onAgain: startRound,
  })
  show('results')
}

endRunBtn.addEventListener('click', finishRun)
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && mode === 'driving') startRun()
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'garage') startRound()
})
// Bank the run's coins if the page is closed or hidden mid-run.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'driving') finishRun()
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
    else if (e.kind === 'flip' || e.kind === 'milestone' || e.kind === 'air' || e.kind === 'wheelie') {
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
  }
}

let last = performance.now()
let accumulator = 0

function frame(now: number): void {
  updateViewport()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (mode === 'driving' && countdown > 0) {
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
      run.step(controls.input)
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
  sound.engine(shownRevs, controls.input.gas && run.fuel > 0 && !next.shifting, mode === 'driving' && run.fuel > 0)
  renderer.draw({
    prev,
    next,
    alpha: mode === 'driving' || mode === 'ending' ? accumulator / STEP : 1,
    spec: run.options.vehicle,
    height: run.options.height,
    env: currentEnv(),
    dt,
    input: controls.input,
    pickups: run.options.pickups.items,
    wheelie: mode === 'driving' ? run.wheelieNow : null,
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
    player: mode === 'driving' || mode === 'ending' ? { name: currentPlayer(), colour: playerColour(currentPlayer()) } : undefined,
    ghosts: mode === 'driving' || mode === 'ending' ? ghostPoses() : [],
    puddles: puddlesFor(currentEnv()),
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
    return pose && pose.fade > 0 ? [{ label: g.label, colour: g.colour, spec: vehicleEntry(g.track.ghost.vehicle).base, pose }] : []
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
if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { renderer, get run() { return run } }

// Offline play and home-screen install (published builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined)
}

openGarage()
renderer.resetCamera(next)
requestAnimationFrame(frame)
