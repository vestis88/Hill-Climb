import { layPickups } from './data/track'
import { applyUpgrades, BASE_LEVELS, FULL_LEVELS, MAX_LEVEL, price, type UpgradeId } from './data/upgrades'
import { createInput } from './input/input'
import { DebugRenderer, type Popup } from './render/debug'
import { levelsFor, loadSave, writeSave } from './save/save'
import { Run } from './sim/run'
import { testHills } from './sim/terrain'
import type { SimState } from './sim/types'
import { STEP, TRACK_LENGTH } from './sim/world'
import { showGarage, showResults } from './ui/screens'
import { loadTuning, showTuning, tuningEnabled, type DriveAs } from './ui/tuning'

const TRACK_ID = 'hills'
const VEHICLE_ID = 'runabout'

const $ = (id: string) => document.getElementById(id) as HTMLElement
const canvas = $('game') as HTMLCanvasElement
const garageEl = $('garage')
const resultsEl = $('results')
const tuneEl = $('tune')
const endRunBtn = $('endRun')

const controls = createInput(canvas)
const renderer = new DebugRenderer(canvas)
const save = loadSave()
const tuning = loadTuning()
let driveAs: DriveAs = 'mine'
const pickups = layPickups(testHills, TRACK_LENGTH)

type Mode = 'garage' | 'driving' | 'ending' | 'results' | 'tuning'
let mode: Mode = 'garage'
let run = newRun()
let prev: SimState = run.sim.state()
let next: SimState = prev
let popups: Popup[] = []
let endTimer = 0

function vehicleSpec() {
  const levels = driveAs === 'base' ? BASE_LEVELS : driveAs === 'full' ? FULL_LEVELS : levelsFor(save, VEHICLE_ID)
  return applyUpgrades(tuning.base, tuning.full, levels)
}

function newRun(): Run {
  return new Run({ vehicle: vehicleSpec(), height: testHills, pickups, bestDistance: save.best[TRACK_ID] ?? 0 })
}

function show(m: Mode): void {
  mode = m
  garageEl.classList.toggle('hidden', m !== 'garage')
  resultsEl.classList.toggle('hidden', m !== 'results')
  tuneEl.classList.toggle('hidden', m !== 'tuning')
  endRunBtn.classList.toggle('hidden', m !== 'driving')
  controls.reset()
}

function openGarage(): void {
  showGarage(garageEl, {
    coins: save.coins,
    levels: levelsFor(save, VEHICLE_ID),
    best: save.best[TRACK_ID] ?? 0,
    tuning: tuningEnabled(),
    onBuy: buy,
    onDrive: startRun,
    onTune: openTuning,
  })
  show('garage')
}

function buy(id: UpgradeId): void {
  const levels = levelsFor(save, VEHICLE_ID)
  if (levels[id] >= MAX_LEVEL) return
  const cost = price(levels[id] + 1)
  if (save.coins < cost) return
  save.coins -= cost
  save.levels[VEHICLE_ID] = { ...levels, [id]: levels[id] + 1 }
  writeSave(save)
  openGarage()
}

function openTuning(): void {
  showTuning(tuneEl, tuning, driveAs, (d) => {
    driveAs = d
    startRun()
  }, openGarage)
  show('tuning')
}

function startRun(): void {
  run = newRun()
  prev = next = run.sim.state()
  popups = []
  renderer.resetCamera(next)
  show('driving')
}

function finishRun(): void {
  if (mode !== 'driving' && mode !== 'ending') return
  const total = run.totalCoins
  const distance = next.distance
  const best = save.best[TRACK_ID] ?? 0
  save.coins += total
  save.best[TRACK_ID] = Math.max(best, distance)
  writeSave(save)
  showResults(resultsEl, {
    status: run.status === 'running' ? 'ended' : run.status,
    distance,
    newBest: distance > best,
    coins: run.coins,
    total,
    bank: save.coins,
    onGarage: openGarage,
    onAgain: startRun,
  })
  show('results')
}

endRunBtn.addEventListener('click', finishRun)
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && mode === 'driving') startRun()
  if ((e.code === 'Enter' || e.code === 'Space') && (mode === 'garage' || mode === 'results')) startRun()
})
// Bank the run's coins if the page is closed or hidden mid-run.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'driving') finishRun()
})

function handleEvents(): void {
  for (const e of run.events) {
    if (e.kind === 'coin') popups.push({ text: `+${e.value}`, at: { x: e.x, y: e.y }, age: 0 })
    else if (e.kind === 'fuel') popups.push({ text: 'Fuel!', at: { x: e.x, y: e.y }, age: 0 })
    else if (e.kind === 'air') popups.push({ text: `Air ${e.seconds.toFixed(1)} s  +${e.value}`, age: 0 })
    else if (e.kind === 'flip') popups.push({ text: `${e.flips > 1 ? `${e.flips}× ` : ''}Flip!  +${e.value}`, age: 0 })
    else if (e.kind === 'milestone') popups.push({ text: `${e.distance} m  +${e.value}`, age: 0 })
  }
}

let last = performance.now()
let accumulator = 0

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (mode === 'driving' || mode === 'ending') {
    accumulator += dt
    while (accumulator >= STEP) {
      prev = next
      run.step(controls.input)
      next = run.sim.state()
      handleEvents()
      accumulator -= STEP
    }
    if (mode === 'driving' && run.status !== 'running') {
      // Let the crash or the final roll show for a moment before the results.
      mode = 'ending'
      endTimer = 1.2
      endRunBtn.classList.add('hidden')
    }
    if (mode === 'ending' && (endTimer -= dt) <= 0) finishRun()
  }
  popups = popups.filter((p) => (p.age += dt) < (p.at ? 0.9 : 1.6))
  renderer.draw({
    prev,
    next,
    alpha: mode === 'driving' || mode === 'ending' ? accumulator / STEP : 1,
    spec: run.options.vehicle,
    height: testHills,
    input: controls.input,
    pickups,
    taken: run.taken,
    fuel: run.fuel,
    runCoins: run.totalCoins,
    popups,
    showPedals: mode === 'driving',
    showHud: mode === 'driving' || mode === 'ending' || mode === 'results',
  })
  requestAnimationFrame(frame)
}

openGarage()
renderer.resetCamera(next)
requestAnimationFrame(frame)
