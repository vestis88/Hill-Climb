import { describe, expect, it } from 'vitest'
import { ENVIRONMENTS, environment, heightFor, puddlesFor } from '../src/data/environments'
import { applyUpgrades, BASE_LEVELS, type Levels } from '../src/data/upgrades'
import { VEHICLES } from '../src/data/vehicles'
import { stageTime } from '../src/sim/stage'

/** Owner request: upgrades should trend towards finishing a stage quicker (npm run stages has the full map). */
describe('upgrades make stages quicker', () => {
  const env = environment('meadow')
  const height = heightFor(env)
  const opts = { gravity: env.gravity, groundFriction: env.groundFriction, puddles: puddlesFor(env), length: 300 }
  const at = (entry: (typeof VEHICLES)[number], level: number) =>
    applyUpgrades(entry.base, entry.full, Object.fromEntries(Object.keys(BASE_LEVELS).map((k) => [k, level])) as Levels)

  it.each(VEHICLES)('$name: times fall as all upgrades rise from 1 to 10', (entry) => {
    const times = [1, 4, 7, 10].map((level) => stageTime(at(entry, level), height, opts).time)
    for (const t of times) expect(t).not.toBeNull()
    const [t1, t4, t7, t10] = times as number[]
    // Trending quicker: each step clearly no slower, and the fully upgraded vehicle much quicker.
    expect(t4).toBeLessThan(t1 * 1.02)
    expect(t7).toBeLessThan(t4 * 1.02)
    expect(t10).toBeLessThan(t7 * 1.02)
    // At least 15% quicker over 300 m (the light bike gains least; heavier vehicles over 30%).
    expect(t10).toBeLessThan(t1 * 0.85)
  }, 60000)
})

describe('every map can be driven', () => {
  it.each(ENVIRONMENTS.map((e) => [e.name, e] as const))('%s: a half-upgraded Runabout and Hauler get through the first 300 m', (_n, env) => {
    const height = heightFor(env)
    for (const id of ['runabout', 'hauler']) {
      const entry = VEHICLES.find((v) => v.id === id)!
      const spec = applyUpgrades(entry.base, entry.full, Object.fromEntries(Object.keys(BASE_LEVELS).map((k) => [k, 5])) as Levels)
      expect(stageTime(spec, height, { gravity: env.gravity, groundFriction: env.groundFriction, puddles: puddlesFor(env), length: 300 }).time, `${id} on ${env.name}`).not.toBeNull()
    }
  }, 60000)
})

