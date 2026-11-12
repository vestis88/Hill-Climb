import { beforeEach, describe, expect, it } from 'vitest'
import { fixedPickups } from '../src/data/track'
import { formatTime, recordKey } from '../src/data/modes'
import { runabout } from '../src/data/vehicles'
import { loadGhost, storeGhost, type Ghost } from '../src/save/ghosts'
import { addScore, emptySave } from '../src/save/save'
import { Run } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

describe('race modes', () => {
  beforeEach(() => {
    const map = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      get length() {
        return map.size
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    }
  })

  it('ends the run at the finish line and times it', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9, finish: 60 })
    for (let i = 0; i < 60 * 30 && run.status === 'running'; i++) run.step({ gas: run.sim.vehicle.chassis.getAngle() < 0.4, brake: false })
    expect(run.status).toBe('finished')
    expect(run.endDistance).toBe(60)
    // Timed to the step it crossed: a plausible few seconds, on a 60 Hz clock.
    expect(run.finishTime!).toBeGreaterThan(3)
    expect(run.finishTime!).toBeLessThan(20)
    expect(Math.abs(run.finishTime! / STEP - Math.round(run.finishTime! / STEP))).toBeLessThan(1e-6)
  })

  it('ranks races by time, unfinished ones below by distance, and keeps them apart from endless', () => {
    const save = emptySave()
    addScore(save, { name: 'Wille', vehicle: 'runabout', env: 'meadow', distance: 500, mode: 'race500', time: 72.4 })
    addScore(save, { name: 'Frans', vehicle: 'runabout', env: 'meadow', distance: 500, mode: 'race500', time: 65.1 })
    expect(addScore(save, { name: 'Johan', vehicle: 'runabout', env: 'meadow', distance: 310, mode: 'race500' })).toBe(true)
    addScore(save, { name: 'Johan', vehicle: 'runabout', env: 'meadow', distance: 420, mode: 'race500' })
    addScore(save, { name: 'Johan', vehicle: 'runabout', env: 'meadow', distance: 900 })
    const race = save.scores.filter((s) => s.mode === 'race500')
    expect(race.map((s) => [s.name, s.time ?? s.distance])).toEqual([['Frans', 65.1], ['Wille', 72.4], ['Johan', 420], ['Johan', 310]])
    expect(save.scores.filter((s) => s.mode === 'endless').map((s) => s.name)).toEqual(['Johan'])
  })

  it('keeps the fastest race ghost as the best, not the furthest', () => {
    const base: Ghost = { v: 1, player: 'Wille', vehicle: 'runabout', env: recordKey('meadow', 'race500'), distance: 500, wheels: 2, data: [0, 0, 0, 0, 0, 0, 0, 0, 0] }
    storeGhost({ ...base, time: 80 })
    storeGhost({ ...base, distance: 320 }) // crashed: no time
    storeGhost({ ...base, time: 70 })
    storeGhost({ ...base, time: 75 })
    expect(loadGhost('Wille', base.env, 'best')!.time).toBe(70)
    expect(loadGhost('Wille', base.env, 'last')!.time).toBe(75)
  })

  it('writes times as m:ss.t', () => {
    expect(formatTime(67.46)).toBe('1:07,4')
    expect(formatTime(9.99)).toBe('0:09,9')
  })
})
