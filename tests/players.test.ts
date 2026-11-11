import { describe, expect, it } from 'vitest'
import { addScore, emptySave, HIGHSCORES, playerBest } from '../src/save/save'

describe('players and highscores', () => {
  it('keeps the best runs per track, furthest first, and only the top ones', () => {
    const save = emptySave()
    for (let i = 1; i <= HIGHSCORES + 3; i++) addScore(save, { name: i % 2 ? 'Wille' : 'Frans', vehicle: 'runabout', env: 'meadow', distance: i * 10.7 })
    addScore(save, { name: 'Johan', vehicle: 'hauler', env: 'frost', distance: 55 })
    const meadow = save.scores.filter((s) => s.env === 'meadow')
    expect(meadow).toHaveLength(HIGHSCORES)
    expect(meadow[0].distance).toBe(Math.floor((HIGHSCORES + 3) * 10.7))
    expect(meadow.every((s, i) => i === 0 || s.distance <= meadow[i - 1].distance)).toBe(true)
    // A run too short for the board does not make it; other tracks keep theirs.
    expect(addScore(save, { name: 'Johan', vehicle: 'runabout', env: 'meadow', distance: 5 })).toBe(false)
    expect(save.scores.filter((s) => s.env === 'frost')).toHaveLength(1)
  })

  it('starts with Wille ticked and no bests', () => {
    const save = emptySave()
    expect(save.players).toEqual(['Wille'])
    expect(playerBest(save, 'Frans', 'meadow')).toBe(0)
  })
})
