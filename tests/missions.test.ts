import { describe as group, expect, it } from 'vitest'
import { describe, done, fillMissions, newMission, progress, type RunStats } from '../src/game/missions'

const stats = (s: Partial<RunStats>): RunStats => ({ backflips: 0, frontflips: 0, airSeconds: 0, longestWheelie: 0, distance: 0, env: 'meadow', coins: 0, maxCombo: 0, ...s })

group('missions (Uppdrag)', () => {
  it('keeps three, all of different kinds', () => {
    for (let i = 0; i < 50; i++) {
      const m = fillMissions([], ['meadow', 'frost'])
      expect(m).toHaveLength(3)
      expect(new Set(m.map((x) => x.kind)).size).toBe(3)
    }
    const one = fillMissions([newMission([], ['meadow'])], ['meadow'])
    expect(one).toHaveLength(3)
  })

  it('counts a run towards each kind, and map missions only on their map', () => {
    expect(done({ kind: 'backflips', target: 2, reward: 200 }, stats({ backflips: 2 }))).toBe(true)
    expect(done({ kind: 'backflips', target: 2, reward: 200 }, stats({ backflips: 1, frontflips: 3 }))).toBe(false)
    expect(done({ kind: 'distance', target: 300, env: 'frost', reward: 150 }, stats({ distance: 400, env: 'meadow' }))).toBe(false)
    expect(done({ kind: 'distance', target: 300, env: 'frost', reward: 150 }, stats({ distance: 400, env: 'frost' }))).toBe(true)
    expect(progress({ kind: 'wheelie', target: 60, reward: 250 }, stats({ longestWheelie: 30 }))).toBe(30)
    expect(done({ kind: 'combo', target: 3, reward: 250 }, stats({ maxCombo: 3 }))).toBe(true)
  })

  it('reads well in Swedish', () => {
    expect(describe({ kind: 'backflips', target: 3, reward: 1 }, String)).toBe('3 bakåtvolter i ett åk')
    expect(describe({ kind: 'distance', target: 600, env: 'frost', reward: 1 }, () => 'Frostpasset')).toBe('Kör 600 m på Frostpasset')
  })
})
