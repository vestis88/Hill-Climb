/**
 * Stage times by upgrade level (npm run stages). For every vehicle and environment, a scripted
 * driver races the first 500 m with all four upgrades at level 1, 2, ... 10, and with each
 * upgrade maxed on its own. Upgrades should trend towards quicker times; not every single
 * level has to be quicker than the one before.
 */
import { it } from 'vitest'
import { ENVIRONMENTS, heightFor } from '../src/data/environments'
import { applyUpgrades, BASE_LEVELS, MAX_LEVEL, type Levels, type UpgradeId } from '../src/data/upgrades'
import { VEHICLES } from '../src/data/vehicles'
import { stageTime } from '../src/sim/stage'

const fmt = (t: number | null) => (t === null ? '  DNF' : t.toFixed(1).padStart(5))

it('stage times', () => {
  const lines: string[] = []
  for (const env of ENVIRONMENTS) {
    const height = heightFor(env)
    const opts = { gravity: env.gravity, airGravity: env.airGravity, groundFriction: env.groundFriction }
    lines.push(`\n${env.name}, first 500 m (seconds; DNF = crashed every try)`)
    lines.push(`vehicle    | all upgrades at level 1..10                                  | each upgrade alone at 10`)
    for (const v of VEHICLES) {
      const row: string[] = []
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const levels = Object.fromEntries(Object.keys(BASE_LEVELS).map((k) => [k, level])) as Levels
        row.push(fmt(stageTime(applyUpgrades(v.base, v.full, levels), height, opts).time))
      }
      const alone = v.upgrades.map((u) => {
        const t = stageTime(applyUpgrades(v.base, v.full, { ...BASE_LEVELS, [u.id as UpgradeId]: MAX_LEVEL }), height, opts).time
        return `${u.name} ${fmt(t).trim()}`
      })
      lines.push(`${v.name.padEnd(10)} | ${row.join(' ')} | ${alone.join(', ')}`)
    }
  }
  console.log(lines.join('\n'))
}, 1200000)
