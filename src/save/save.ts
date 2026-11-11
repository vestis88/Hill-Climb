import { BASE_LEVELS, type Levels } from '../data/upgrades'

/** Everything kept between sessions. Stored in this browser only. */
export interface SaveData {
  version: 1
  coins: number
  /** Upgrade levels per vehicle id. */
  levels: Record<string, Levels>
  /** Best distance per environment id, metres. */
  best: Record<string, number>
  /** Environment and vehicle ids bought with coins (the free ones are always open). */
  unlocked: string[]
  /** Last chosen environment and vehicle. */
  envId: string
  vehicleId: string
  /** Who plays the next round, in turn order. */
  players: string[]
  /** Best distance per player, then per environment id, metres. */
  playerBest: Record<string, Record<string, number>>
  /** Highscore board: the best runs on each track (top HIGHSCORES per environment and mode). */
  scores: Score[]
  /** Last chosen game mode (see data/modes.ts). */
  modeId: string
  /** Best race time per player, then per record key (data/modes.ts recordKey), seconds. */
  playerTimes: Record<string, Record<string, number>>
}

export interface Score {
  name: string
  vehicle: string
  env: string
  distance: number
  /** Game mode (see data/modes.ts); absent on scores from before races existed: endless. */
  mode?: string
  /** Race time in seconds, for a finished race. */
  time?: number
}

const modeOf = (s: Score) => s.mode ?? 'endless'
/** Better first: the fastest finished race, or the furthest endless run. */
const better = (a: Score, b: Score) => (a.time !== undefined || b.time !== undefined ? (a.time ?? Infinity) - (b.time ?? Infinity) : b.distance - a.distance)

/** Runs kept per track on the highscore board. */
export const HIGHSCORES = 10

/** Add a run to the board, keeping the best HIGHSCORES per track. True if it made the board. */
export function addScore(save: SaveData, score: Score): boolean {
  const rounded = { ...score, mode: modeOf(score), distance: Math.floor(score.distance) }
  // Races only rank finished runs; endless runs need some distance.
  if (rounded.mode === 'endless' ? rounded.distance <= 0 : rounded.time === undefined) return false
  const same = (s: Score) => s.env === score.env && modeOf(s) === rounded.mode
  const others = save.scores.filter((s) => !same(s))
  const board = [...save.scores.filter(same), rounded].sort(better).slice(0, HIGHSCORES)
  save.scores = [...others, ...board]
  return board.includes(rounded)
}

/** A player's best race time for a record key, seconds (Infinity before they finish one). */
export const playerTime = (save: SaveData, name: string, key: string) => save.playerTimes[name]?.[key] ?? Infinity

/** A player's best distance on a track, metres. */
export const playerBest = (save: SaveData, name: string, env: string) => save.playerBest[name]?.[env] ?? 0

const KEY = 'ridgeline.save'

export function emptySave(): SaveData {
  return { version: 1, coins: 0, levels: {}, best: {}, unlocked: [], envId: 'meadow', vehicleId: 'runabout', players: ['Wille'], playerBest: {}, scores: [], modeId: 'endless', playerTimes: {} }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptySave()
    const data = JSON.parse(raw)
    if (data?.version !== 1) return emptySave()
    const save: SaveData = { ...emptySave(), ...data }
    // Version 1 saves from before environments kept the best distance under "hills".
    if (save.best.hills !== undefined && save.best.meadow === undefined) save.best.meadow = save.best.hills
    delete save.best.hills
    // The Scrambler and Hauler swapped Drivetrain for a weight upgrade: carry bought levels over.
    for (const id of ['scrambler', 'hauler']) {
      const l = save.levels[id] as Partial<Levels> | undefined
      if (l?.drivetrain && l.drivetrain > 1 && !l.weight) {
        l.weight = l.drivetrain
        l.drivetrain = 1
      }
    }
    // The Scrambler swapped its lighter frame for flip control: carry bought levels over.
    const bike = save.levels.scrambler as Partial<Levels> | undefined
    if (bike?.weight && bike.weight > 1 && !bike.flip) {
      bike.flip = bike.weight
      bike.weight = 1
    }
    return save
  } catch {
    return emptySave()
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Private browsing or storage full: progress just won't persist.
  }
}

export function levelsFor(data: SaveData, vehicleId: string): Levels {
  return { ...BASE_LEVELS, ...data.levels[vehicleId] }
}
