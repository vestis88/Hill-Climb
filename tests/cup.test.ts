import { describe, expect, it } from 'vitest'
import { cupTable, cupWinners, lastTrack, newCup, scoreTrack } from '../src/game/cup'

const r = (name: string, distance: number, time?: number) => ({ name, vehicle: 'Buggyn', distance, time, newBest: false })

describe('tournament (Tävling)', () => {
  it('picks three different owned tracks, repeating only when fewer are owned', () => {
    const cup = newCup(['meadow', 'crater', 'frost', 'dunes'], ['Wille', 'Frans'])
    expect(new Set(cup.tracks).size).toBe(3)
    expect(newCup(['meadow'], ['Wille', 'Frans']).tracks).toEqual(['meadow', 'meadow', 'meadow'])
    expect(newCup(['meadow', 'crater'], ['Wille']).tracks.length).toBe(3)
  })

  it('gives 5, 3, 2, 1 points by placing, ties sharing, and finds the winner after three tracks', () => {
    const cup = newCup(['meadow', 'crater', 'frost'], ['Wille', 'Frans', 'Johan', 'Bim'])
    scoreTrack(cup, [r('Frans', 400), r('Wille', 300), r('Johan', 300), r('Bim', 50)])
    expect(cup.points).toEqual({ Wille: 3, Frans: 5, Johan: 3, Bim: 1 })
    cup.index = 1
    scoreTrack(cup, [r('Wille', 500, 61), r('Johan', 500, 66), r('Frans', 500, 70), r('Bim', 200)])
    cup.index = 2
    expect(lastTrack(cup)).toBe(true)
    scoreTrack(cup, [r('Wille', 900), r('Frans', 800), r('Bim', 700), r('Johan', 10)])
    expect(cupTable(cup).map((x) => [x.name, x.points])).toEqual([['Wille', 13], ['Frans', 10], ['Johan', 7], ['Bim', 4]])
    expect(cupWinners(cup)).toEqual(['Wille'])
  })
})
