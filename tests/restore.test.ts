import { describe, expect, it } from 'vitest'
import { ENVIRONMENTS } from '../src/data/environments'
import { LEVELS } from '../src/data/klurbanor'
import { VEHICLES } from '../src/data/vehicles'
import { emptySave, levelsFor } from '../src/save/save'
import { restoreProgress } from '../src/save/restore'

describe('restoring lost progress', () => {
  it('adds coins, unlocks, Klurbanor and upgrade levels', () => {
    const s = emptySave()
    restoreProgress(s, { coins: 5000, unlockAll: true, klur: 12, level: 6 })
    expect(s.coins).toBe(5000)
    for (const item of [...VEHICLES, ...ENVIRONMENTS]) if (item.price > 0) expect(s.unlocked).toContain(item.id)
    expect(s.unlocked.filter((u) => u.startsWith('klur:'))).toEqual(LEVELS.slice(0, 12).map((l) => `klur:${l.id}`))
    for (const v of VEHICLES) for (const u of v.upgrades) expect(levelsFor(s, v.id)[u.id]).toBe(6)
  })

  it('never takes anything away', () => {
    const s = emptySave()
    s.levels[VEHICLES[0].id] = { ...levelsFor(s, VEHICLES[0].id), [VEHICLES[0].upgrades[0].id]: 9 }
    s.unlocked.push('klur:' + LEVELS[20].id)
    restoreProgress(s, { coins: 0, unlockAll: false, klur: 2, level: 4 })
    expect(levelsFor(s, VEHICLES[0].id)[VEHICLES[0].upgrades[0].id]).toBe(9)
    expect(s.unlocked).toContain('klur:' + LEVELS[20].id)
    restoreProgress(s, { coins: 0, unlockAll: false, klur: 2, level: 4 })
    expect(s.unlocked.filter((u) => u.startsWith('klur:')).length).toBe(3)
  })
})
