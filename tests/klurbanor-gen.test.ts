import { describe, expect, it } from 'vitest'
import { GENERATED } from '../src/data/klurbanor-gen'
import { drivePlan } from '../src/game/klurbot'

/**
 * The generated Klurbanor (scripts/levelgen.sim.ts): each is driven to the goal by its own plan,
 * as the generator proved when it made it. A change to the physics that breaks one shows here;
 * then regenerate (npm run levelgen).
 */
describe('generated Klurbanor', () => {
  it('there are some, with unique ids and names', () => {
    expect(GENERATED.length).toBeGreaterThan(0)
    expect(new Set(GENERATED.map((l) => l.id)).size).toBe(GENERATED.length)
    expect(new Set(GENERATED.map((l) => l.name)).size).toBe(GENERATED.length)
  })

  it.each(GENERATED.map((l) => [l.id, l.name, l] as const))('%s %s can be finished', (_, __, level) => {
    const { run } = drivePlan(level, 'runabout', 240)
    expect(run.gemsLeft).toEqual([])
    expect(run.status).toBe('finished')
  }, 120000)
})
