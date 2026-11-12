import type { RoundResult } from './round'

/**
 * Tävling (a tournament): three tracks in a row, each played as a round by the ticked players.
 * Placings on each track give points (5, 3, 2, 1, then 0); the most points after the third
 * track wins the cup. Plain data and functions, tested in tests/cup.test.ts.
 */
export interface Cup {
  /** The three tracks (environment ids), in order. */
  tracks: string[]
  /** Which track is being played: 0, 1 or 2. */
  index: number
  points: Record<string, number>
}

export const CUP_TRACKS = 3
export const PLACING_POINTS = [5, 3, 2, 1]

/** A new cup on three tracks drawn from the owned maps (repeats only when fewer than three are owned). */
export function newCup(owned: string[], players: string[], random: () => number = Math.random): Cup {
  const pool = [...owned]
  const tracks: string[] = []
  for (let i = 0; i < CUP_TRACKS; i++) {
    if (!pool.length) pool.push(...owned)
    tracks.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  }
  return { tracks, index: 0, points: Object.fromEntries(players.map((p) => [p, 0])) }
}

/** Award points for a finished track from its standings (best first); ties share the better placing. */
export function scoreTrack(cup: Cup, standings: RoundResult[]): void {
  let place = 0
  standings.forEach((r, i) => {
    const prev = standings[i - 1]
    const tie = prev && prev.distance === r.distance && prev.time === r.time
    if (!tie) place = i
    cup.points[r.name] = (cup.points[r.name] ?? 0) + (PLACING_POINTS[place] ?? 0)
  })
}

export const lastTrack = (cup: Cup) => cup.index >= CUP_TRACKS - 1

/** Players by points, most first. */
export const cupTable = (cup: Cup) =>
  Object.entries(cup.points)
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points)

/** The winners (more than one on equal points). */
export function cupWinners(cup: Cup): string[] {
  const table = cupTable(cup)
  return table.filter((r) => r.points === table[0]?.points).map((r) => r.name)
}
