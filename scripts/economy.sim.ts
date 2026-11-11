/**
 * Economy simulation (task U2). Run with: npm run economy
 *
 * A scripted driver plays run after run in Green Meadows with the Runabout and,
 * after each run, buys the cheapest upgrade it can afford. It prints how many runs
 * each purchase took and an estimate of total play time. The scripted driver is
 * steadier than a child, so treat the numbers as a fast-player estimate.
 */
import { it } from 'vitest'
import { environment, heightFor } from '../src/data/environments'
import { PickupField } from '../src/data/track'
import { applyUpgrades, BASE_LEVELS, MAX_LEVEL, price, type Levels, type UpgradeId } from '../src/data/upgrades'
import { runabout, runaboutFull, vehicleEntry } from '../src/data/vehicles'
import { Run } from '../src/sim/run'
import { STEP } from '../src/sim/world'

const MAX_RUNS = 400
/** Seconds between runs: results screen, garage, tapping Drive. */
const MENU_SECONDS = 15

it('economy', () => {
  const env = environment('meadow')
  const height = heightFor(env)
  let levels: Levels = { ...BASE_LEVELS }
  let coins = 0
  let best = 0
  let seconds = 0
  const lines: string[] = []

  for (let n = 1; n <= MAX_RUNS; n++) {
    const run = new Run({
      vehicle: applyUpgrades(runabout, runaboutFull, levels),
      height,
      gravity: env.gravity,
      groundFriction: env.groundFriction,
      pickups: new PickupField(height, env.seed),
      bestDistance: best,
    })
    // Varies a little each run so the driver does not repeat the exact same crash.
    const caution = 0.25 + 0.15 * ((n * 7) % 5) / 4
    let steps = 0
    while (run.status === 'running' && steps < 60 * 600) {
      const s = run.sim.state()
      const pitch = s.chassis.angle
      const x = s.chassis.x
      const slope = Math.atan((height(x + 1) - height(x - 1)) / 2)
      run.step(s.airborne ? { gas: pitch < slope - 0.15, brake: pitch > slope + 0.15 } : { gas: pitch - slope < caution, brake: false })
      steps++
    }
    const earned = run.totalCoins
    coins += earned
    best = Math.max(best, run.endDistance ?? run.sim.state().distance)
    seconds += steps * STEP + MENU_SECONDS

    const bought: string[] = []
    for (;;) {
      // Only the upgrades the Runabout offers.
      const offered = vehicleEntry('runabout').upgrades.map((u) => u.id) as UpgradeId[]
      const options = offered.filter((id) => levels[id] < MAX_LEVEL)
      if (!options.length) break
      const id = options.reduce((a, b) => (price(levels[a] + 1) <= price(levels[b] + 1) ? a : b))
      const cost = price(levels[id] + 1)
      if (cost > coins) break
      coins -= cost
      levels = { ...levels, [id]: levels[id] + 1 }
      bought.push(`${id} ${levels[id]}`)
    }
    if (bought.length || n <= 3) {
      lines.push(
        `run ${String(n).padStart(3)}  ${run.status.padEnd(9)} ${Math.round(run.endDistance ?? 0).toString().padStart(5)} m  +${String(earned).padStart(5)} coins` +
          `  ${(seconds / 60).toFixed(0).padStart(4)} min played  ${bought.length ? 'bought ' + bought.join(', ') : ''}`,
      )
    }
    if (vehicleEntry('runabout').upgrades.every((u) => levels[u.id] === MAX_LEVEL)) {
      lines.push(`Fully upgraded after ${n} runs, about ${(seconds / 3600).toFixed(1)} hours of play.`)
      break
    }
    if (n === MAX_RUNS) lines.push(`Not fully upgraded after ${MAX_RUNS} runs: ${JSON.stringify(levels)}`)
  }
  console.log(lines.join('\n'))
}, 600000)
