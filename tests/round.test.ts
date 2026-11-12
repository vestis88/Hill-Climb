import { describe, expect, it } from 'vitest'
import { advance, emptyRound, nextPlayerOf, nextRound, playerOf, recordTurn, roundOver, standings, together } from '../src/game/round'
import type { Ghost } from '../src/save/ghosts'

const ghost = (player: string, env: string, distance: number): Ghost => ({ v: 1, player, vehicle: 'runabout', env, distance, wheels: 2, data: [distance] })
const result = (name: string, distance: number, time?: number) => ({ name, vehicle: 'Buggyn', distance, time, newBest: false })

describe('rounds', () => {
  it('goes through the players in turn and ends after the last', () => {
    const r = emptyRound(['Wille', 'Frans', 'Bim'])
    expect(together(r)).toBe(true)
    expect(playerOf(r, '?')).toBe('Wille')
    recordTurn(r, result('Wille', 100), null)
    expect(nextPlayerOf(r)).toBe('Frans')
    expect(roundOver(r)).toBe(false)
    advance(r)
    advance(r)
    expect(playerOf(r, '?')).toBe('Bim')
    expect(nextPlayerOf(r)).toBeUndefined()
    expect(roundOver(r)).toBe(true)
    // Alone, there is no round to finish.
    expect(roundOver(emptyRound(['Wille']))).toBe(false)
  })

  it("keeps each player's latest run of the round as a ghost (a retake replaces it)", () => {
    const r = emptyRound(['Wille', 'Frans'])
    recordTurn(r, result('Wille', 100), ghost('Wille', 'meadow', 100))
    recordTurn(r, result('Frans', 80), ghost('Frans', 'meadow', 80))
    recordTurn(r, result('Wille', 150), ghost('Wille', 'meadow', 150))
    expect(r.ghosts.map((g) => [g.player, g.distance])).toEqual([['Frans', 80], ['Wille', 150]])
  })

  it('brings everyone\'s latest runs into the next round on the same track only', () => {
    const first = emptyRound(['Wille', 'Frans'])
    recordTurn(first, result('Wille', 100), ghost('Wille', 'meadow', 100))
    recordTurn(first, result('Frans', 80), ghost('Frans', 'meadow', 80))
    const second = nextRound(first, ['Wille', 'Frans'], 'meadow')
    expect(second.previous.map((g) => g.distance).sort()).toEqual([100, 80].sort())
    expect(second.results).toEqual([])
    // Frans drives again; the third round has his newer run and Wille's older one.
    recordTurn(second, result('Frans', 120), ghost('Frans', 'meadow', 120))
    const third = nextRound(second, ['Wille', 'Frans'], 'meadow')
    expect(third.previous.map((g) => [g.player, g.distance])).toEqual([['Wille', 100], ['Frans', 120]])
    // Another track: nothing carries over.
    expect(nextRound(third, ['Wille'], 'frost').previous).toEqual([])
  })

  it('ranks races by time with non-finishers after, and endless runs by distance', () => {
    const race = emptyRound(['Wille', 'Frans', 'Johan'])
    recordTurn(race, result('Wille', 500, 72.4), null)
    recordTurn(race, result('Frans', 310), null)
    recordTurn(race, result('Johan', 500, 65.1), null)
    expect(standings(race).map((x) => x.name)).toEqual(['Johan', 'Wille', 'Frans'])
    const endless = emptyRound(['Wille', 'Frans'])
    recordTurn(endless, result('Wille', 300), null)
    recordTurn(endless, result('Frans', 450), null)
    expect(standings(endless).map((x) => x.name)).toEqual(['Frans', 'Wille'])
  })
})
