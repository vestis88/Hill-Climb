import { describe, expect, it } from 'vitest'
import { LEVELS, puzzleLevel, type PuzzleLevel } from '../src/data/klurbanor'
import { drivePlan } from '../src/game/klurbot'
import { circleHits, groundBelow } from '../src/sim/level'

/** The level with another plan (to show a wrong way fails). */
const withPlan = (id: string, plan: PuzzleLevel['plan']): PuzzleLevel => ({ ...puzzleLevel(id)!, plan })

describe('Klurbanor', () => {
  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))('%s %s can be finished: every gem, then the goal', (_, __, level) => {
    const { run } = drivePlan(level)
    expect(run.gemsLeft).toEqual([])
    expect(run.status).toBe('finished')
    expect(run.finishTime).toBeGreaterThan(3)
  }, 60000)

  it('level geometry: start and goal are on solid ground, gems are in the open', () => {
    for (const l of LEVELS) {
      expect(groundBelow(l.geom, l.start.x, l.start.y + 0.5), l.id).toBeCloseTo(l.start.y, 0)
      for (const g of l.gems) expect(circleHits(l.geom, g.x, g.y, 0.3), `${l.id} gem at ${g.x}`).toBe(false)
      expect(circleHits(l.geom, l.goal.x, l.goal.y, 0.3), `${l.id} goal`).toBe(false)
    }
  })

  it('1 · Två vägar: going fast takes the high road, the loop and the pit', () => {
    const { run } = drivePlan(withPlan('k1', [{ x: 200, speed: 16 }]))
    expect(run.status).toBe('crashed')
    expect(run.gemsLeft.length).toBe(3)
  }, 60000)

  it('2 · Lagom: too slow over the edge drops into the gap before the pillar', () => {
    const { run } = drivePlan(withPlan('k2', [{ x: 38, speed: 9 }, { x: 64, speed: 3 }, { x: 74, speed: 1 }]))
    expect(run.status).toBe('crashed')
  }, 60000)

  it('3 · Lågt i tak: rushing the tunnel bangs your head on the roof', () => {
    const { run } = drivePlan(withPlan('k3', [{ x: 150, speed: 16 }]))
    expect(run.status).toBe('crashed')
    expect(run.sim.state().chassis.x).toBeLessThan(92)
  }, 60000)

  it('4 · Gungan: just driving at the wall does not get you out', () => {
    const { run } = drivePlan(withPlan('k4', [{ x: 60, speed: 16 }]), 'runabout', 40)
    expect(run.status).not.toBe('finished')
  }, 60000)
})
