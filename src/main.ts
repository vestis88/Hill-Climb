import { ENVIRONMENTS, environment, heightFor } from './data/environments'
import { PickupField } from './data/track'
import { VEHICLES, vehicleEntry } from './data/vehicles'
import { applyUpgrades, BASE_LEVELS, FULL_LEVELS, MAX_LEVEL, price, type UpgradeId } from './data/upgrades'
import { Sound } from './audio/sound'
import { createInput } from './input/input'
import { GameRenderer, type Popup } from './render/game'
import { drawEnvironmentPreview, drawVehiclePreview } from './render/preview'
import { addScore, emptySave, levelsFor, loadSave, playerBest, writeSave } from './save/save'
import { clearGhosts, GhostRecorder, GhostTrack, loadGhost, storeGhost } from './save/ghosts'
import { PLAYERS, playerColour } from './data/players'
import { Run } from './sim/run'
import type { SimState } from './sim/types'
import { STEP } from './sim/world'
import { showGarage, showResults, showScores, showStandings } from './ui/screens'
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
const tuning = loadTuning()
let driveAs: DriveAs = 'mine'

type Mode = 'garage' | 'driving' | 'ending' | 'results' | 'tuning' | 'settings' | 'scores'
let mode: Mode = 'garage'
/**
 * A round: each ticked player drives once, in turn, on the same vehicle and track; then the
 * standings. One player alone is a round of one.
 */
interface Round {
  players: string[]
  turn: number
  results: { name: string; distance: number; newBest: boolean }[]
}
// Declared before the first run is created below, which reads them.
let round: Round = { players: [...save.players], turn: 0, results: [] }
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
function currentEnv() {
  return environment(save.envId)
}
function currentVehicle() {
  return vehicleEntry(save.vehicleId)
}
function currentPlayer(): string {
  return round.players[round.turn] ?? save.players[0] ?? PLAYERS[0].name
}

function vehicleSpec() {
  const entry = currentVehicle()
  const levels = driveAs === 'base' ? BASE_LEVELS : driveAs === 'full' ? FULL_LEVELS : levelsFor(save, entry.id)
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
    pickups: new PickupField(height, env.seed),
    // Distance bonuses count from this player's own best.
    bestDistance: playerBest(save, currentPlayer(), env.id),
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
      owned: owned(e.id, e.price), selected: e.id === currentEnv().id,
      note: `Best ${Math.floor(save.best[e.id] ?? 0)} m`,
      preview: (c: HTMLCanvasElement) => drawEnvironmentPreview(c, e, heightFor(e)),
    })),
    onPick: pick,
    tuning: tuningEnabled(),
    testMode: tuningEnabled(),
    onBuy: buy,
    players: PLAYERS.map((p) => ({ name: p.name, colour: p.colour, on: save.players.includes(p.name) })),
    onTogglePlayer: togglePlayer,
    onScores: () => openScores(currentEnv().id),
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
  writeSave(save)
  openGarage()
}

function openScores(envId: string): void {
  const env = environment(envId)
  showScores(scoresEl, {
    tracks: ENVIRONMENTS.map((e) => ({ id: e.id, name: e.name })),
    track: env.id,
    rows: save.scores.filter((s) => s.env === env.id).map((s) => ({ name: s.name, colour: playerColour(s.name), vehicle: vehicleEntry(s.vehicle).name, distance: s.distance })),
    bests: PLAYERS.map((p) => ({ name: p.name, colour: p.colour, distance: playerBest(save, p.name, env.id) })),
    onTrack: openScores,
    onBack: () => openGarage(),
  })
  show('scores')
}

/** Select a vehicle or environment, buying it first if it is locked and affordable. */
function pick(kind: 'vehicle' | 'env', id: string): void {
  const item = kind === 'vehicle' ? vehicleEntry(id) : environment(id)
  if (!owned(item.id, item.price)) {
    if (save.coins < item.price) return
    save.coins -= item.price
    save.unlocked.push(item.id)
  }
  if (kind === 'vehicle') save.vehicleId = item.id
  else save.envId = item.id
  writeSave(save)
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
  if (save.coins < cost) return
  save.coins -= cost
  save.levels[VEHICLE_ID] = { ...levels, [id]: levels[id] + 1 }
  writeSave(save)
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
      Object.assign(save, emptySave())
      writeSave(save)
      clearGhosts()
      run = newRun()
      prev = next = run.sim.state()
      renderer.resetCamera(next)
    },
    openGarage,
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
  round = { players: [...save.players], turn: 0, results: [] }
  startRun()
}

/**
 * Ghosts for this turn: the player's own best and last runs on this track, and the best run of
 * the others in the round.
 */
function pickGhosts(): void {
  const env = currentEnv().id
  const me = currentPlayer()
  ghosts = []
  const add = (g: ReturnType<typeof loadGhost>, label: string) => {
    if (g && g.data.length) ghosts.push({ label, colour: playerColour(g.player), track: new GhostTrack(g) })
  }
  const best = loadGhost(me, env, 'best')
  const last = loadGhost(me, env, 'last')
  add(best, `${me} best`)
  // The last run is often the best one too; show it once.
  if (last && !(best && last.distance === best.distance && last.data.length === best.data.length)) add(last, `${me} last`)
  const others = round.players.filter((p) => p !== me).map((p) => loadGhost(p, env, 'best')).filter((g) => g !== null)
  const top = others.sort((a, b) => b.distance - a.distance)[0]
  if (top) add(top, `${top.player} best`)
}

function startRun(): void {
  sound.setVehicle(currentVehicle().id)
  run = newRun()
  pickGhosts()
  recorder = new GhostRecorder(run.options.vehicle.wheels.length)
  recorder.sample(run.sim.state())
  prev = next = run.sim.state()
  popups = []
  renderer.resetCamera(next)
  show('driving')
}

function finishRun(): void {
  if (mode !== 'driving' && mode !== 'ending') return
  const total = run.totalCoins
  const distance = run.endDistance ?? next.distance
  const envId = currentEnv().id
  const me = currentPlayer()
  const best = playerBest(save, me, envId)
  save.coins += total
  save.best[envId] = Math.max(save.best[envId] ?? 0, distance)
  save.playerBest[me] = { ...save.playerBest[me], [envId]: Math.max(best, distance) }
  addScore(save, { name: me, vehicle: currentVehicle().id, env: envId, distance })
  writeSave(save)
  // Keep this run as the player's last ghost (and best, if it went further). Not in test drives.
  if (driveAs === 'mine' && distance > 1) storeGhost(recorder.finish({ player: me, vehicle: currentVehicle().id, env: envId, distance }))
  round.results.push({ name: me, distance, newBest: distance > best })
  const nextPlayer = round.players[round.turn + 1]
  showResults(resultsEl, {
    status: run.status === 'running' ? 'ended' : run.status,
    distance,
    newBest: distance > best,
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
      startRun()
    },
    onStandings: openStandings,
  })
  show('results')
}

/** The round's results, furthest first; then back to the garage or another round. */
function openStandings(): void {
  showStandings(resultsEl, {
    track: currentEnv().name,
    vehicle: currentVehicle().name,
    rows: [...round.results].sort((a, b) => b.distance - a.distance).map((r) => ({ ...r, colour: playerColour(r.name) })),
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
function handleEvents(): void {
  const s = run.sim.state()
  if (wasAirborne && !s.airborne) sound.land(Math.abs(run.sim.vehicle.chassis.getLinearVelocity().y) / 15)
  wasAirborne = s.airborne
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
      popups.push({ text: e.bonus ? `Made it on empty!  +${e.bonus}` : 'Fuel!', at: { x: e.x, y: e.y }, age: 0 })
      if (e.bonus) {
        sound.fanfare()
        renderer.cheer()
      }
      renderer.sparkle(e.x, e.y, '#ff9a9a')
    }
    else if (e.kind === 'air') popups.push({ text: `Air ${e.seconds.toFixed(1)} s  +${e.value}`, age: 0 })
    else if (e.kind === 'wheelie') popups.push({ text: `Wheelie ${Math.floor(e.metres)} m  +${e.value}`, age: 0 })
    else if (e.kind === 'flip') {
      const name = ['', '', 'Double ', 'Triple ', 'Quad '][e.flips] ?? `${e.flips}× `
      popups.push({ text: `${name}${e.direction === 'back' ? 'backflip' : 'frontflip'}!  +${e.value}`, age: 0 })
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
  if (mode === 'driving' || mode === 'ending') {
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
  sound.engine(next.revs, controls.input.gas && run.fuel > 0 && !next.shifting, mode === 'driving' && run.fuel > 0)
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
    fuel: run.fuel,
    runCoins: run.totalCoins,
    popups,
    showPedals: mode === 'driving',
    swapPedals: settings.swapPedals,
    driver: { lean: run.sway.lean, ragdoll: run.ragdoll?.poses() ?? null },
    player: mode === 'driving' || mode === 'ending' ? { name: currentPlayer(), colour: playerColour(currentPlayer()) } : undefined,
    ghosts: mode === 'driving' || mode === 'ending' ? ghostPoses() : [],
    showHud: mode === 'driving' || mode === 'ending' || mode === 'results',
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

// Offline play and home-screen install (published builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined)
}

openGarage()
renderer.resetCamera(next)
requestAnimationFrame(frame)
