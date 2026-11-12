import type { Ghost } from '../save/ghosts'

/**
 * A round: the ticked players take one turn each, in order, on the same track and mode. This
 * module holds the round's rules as plain functions on plain data, so they can be tested without
 * the game around them (tests/round.test.ts); src/main.ts drives the screens.
 */
export interface RoundResult {
  name: string
  vehicle: string
  distance: number
  /** Race time, for a finished race. */
  time?: number
  newBest: boolean
}

export interface Round {
  players: string[]
  /** Whose turn it is: an index into players. */
  turn: number
  results: RoundResult[]
  /** This round's runs, as ghosts for the players after them (kept in memory only). */
  ghosts: Ghost[]
  /** Runs from earlier rounds on this same track and mode, shown until the player drives again. */
  previous: Ghost[]
}

export const emptyRound = (players: string[]): Round => ({ players: [...players], turn: 0, results: [], ghosts: [], previous: [] })

/**
 * A new round after `before`. On the same track and mode (`key`, a record key) everyone's latest
 * run from the rounds before is carried over as a ghost; on another track nothing is.
 */
export function nextRound(before: Round, players: string[], key: string): Round {
  const latest = [...before.previous.filter((p) => !before.ghosts.some((g) => g.player === p.player)), ...before.ghosts]
  return { ...emptyRound(players), previous: latest.filter((g) => g.env === key) }
}

/** True when several players take turns (a single player just drives). */
export const together = (r: Round) => r.players.length > 1

export const playerOf = (r: Round, fallback: string) => r.players[r.turn] ?? fallback

/** The player after this turn, or undefined after the last turn. */
export const nextPlayerOf = (r: Round): string | undefined => r.players[r.turn + 1]

/** True after the last turn of a round with several players: the standings come next. */
export const roundOver = (r: Round) => together(r) && nextPlayerOf(r) === undefined

/** Record a finished turn: its result, and its run as a ghost (a retake replaces the earlier run). */
export function recordTurn(r: Round, result: RoundResult, ghost: Ghost | null): void {
  r.results.push(result)
  if (ghost) r.ghosts = [...r.ghosts.filter((g) => g.player !== result.name), ghost]
}

export function advance(r: Round): void {
  r.turn++
}

/** The round's standings: in races, finishers by time, then the rest by how far they got; else by distance. */
export const standings = (r: Round): RoundResult[] =>
  [...r.results].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || b.distance - a.distance)
