import type { Mission } from '../game/missions'
import { BASE_LEVELS, type Levels } from '../data/upgrades'

/** Everything kept between sessions. Stored in this browser only. */
export interface SaveData {
  version: 1
  /** Coins in the bank: always the ledger's earned minus spent (see earn, spend). */
  coins: number
  /**
   * Coins earned and spent, per device. Each device only ever raises its own two counters, so
   * two devices playing at once merge without losing or double-counting coins (cloud sync).
   */
  ledger: Record<string, { earned: number; spent: number }>
  /** This device's id in the ledger. Local only: never merged from another device. */
  deviceId: string
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
  /** Each player's own vehicle for rounds with several players (this device only, not synced). */
  playerVehicles?: Record<string, string>
  /** Each player's three missions (this device only). */
  missions?: Record<string, Mission[]>
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
/**
 * Better first: finished races by time, then unfinished ones (DNF) by how far they got; endless
 * runs by distance.
 */
const better = (a: Score, b: Score) => {
  if (a.time !== undefined && b.time !== undefined) return a.time - b.time
  if (a.time !== undefined) return -1
  if (b.time !== undefined) return 1
  return b.distance - a.distance
}

/** Runs kept per track on the highscore board. */
export const HIGHSCORES = 10

/** Add a run to the board, keeping the best HIGHSCORES per track. True if it made the board. */
export function addScore(save: SaveData, score: Score): boolean {
  const rounded = { ...score, mode: modeOf(score), distance: Math.floor(score.distance) }
  // Every run with some distance goes on the board; unfinished races rank below finished ones.
  if (rounded.distance <= 0 && rounded.time === undefined) return false
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

function newDeviceId(): string {
  const bytes = new Uint8Array(8)
  globalThis.crypto?.getRandomValues?.(bytes)
  return 'd' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const recount = (save: SaveData) => {
  save.coins = Object.values(save.ledger).reduce((n, l) => n + l.earned - l.spent, 0)
}
const mine = (save: SaveData) => (save.ledger[save.deviceId] ??= { earned: 0, spent: 0 })

/** Bank coins earned on this device. */
export function earn(save: SaveData, amount: number): void {
  mine(save).earned += Math.max(0, Math.floor(amount))
  recount(save)
}

/** Spend coins on this device; false (and nothing spent) if there are not enough. */
export function spend(save: SaveData, amount: number): boolean {
  if (amount > save.coins) return false
  mine(save).spent += amount
  recount(save)
  return true
}

/** The parts of a save that sync between devices (not the device id or current choices). */
export type SyncedSave = Pick<SaveData, 'version' | 'ledger' | 'levels' | 'best' | 'unlocked' | 'playerBest' | 'scores' | 'playerTimes'>

export function syncedPart(save: SaveData): SyncedSave {
  const { version, ledger, levels, best, unlocked, playerBest, scores, playerTimes } = save
  return { version, ledger, levels, best, unlocked, playerBest, scores, playerTimes }
}

/**
 * Merge another device's progress into this save, keeping the best of both: each device's coin
 * counters at their highest, upgrade levels at their highest, unlocks combined, bests at their
 * best, and the highscore boards combined. Merging the same thing twice changes nothing.
 */
export function mergeInto(save: SaveData, other: Partial<SyncedSave>): void {
  for (const [id, l] of Object.entries(other.ledger ?? {})) {
    const m = (save.ledger[id] ??= { earned: 0, spent: 0 })
    m.earned = Math.max(m.earned, l.earned ?? 0)
    m.spent = Math.max(m.spent, l.spent ?? 0)
  }
  for (const [vehicle, levels] of Object.entries(other.levels ?? {})) {
    const m = (save.levels[vehicle] ??= { ...BASE_LEVELS })
    for (const [k, v] of Object.entries(levels)) m[k as keyof Levels] = Math.max(m[k as keyof Levels] ?? 1, v)
  }
  for (const [env, d] of Object.entries(other.best ?? {})) save.best[env] = Math.max(save.best[env] ?? 0, d)
  save.unlocked = [...new Set([...save.unlocked, ...(other.unlocked ?? [])])]
  for (const [name, bests] of Object.entries(other.playerBest ?? {})) {
    const m = (save.playerBest[name] ??= {})
    for (const [env, d] of Object.entries(bests)) m[env] = Math.max(m[env] ?? 0, d)
  }
  for (const [name, times] of Object.entries(other.playerTimes ?? {})) {
    const m = (save.playerTimes[name] ??= {})
    for (const [key, t] of Object.entries(times)) m[key] = Math.min(m[key] ?? Infinity, t)
  }
  const id = (s: Score) => `${s.name}|${s.vehicle}|${s.env}|${modeOf(s)}|${s.distance}|${s.time ?? ''}`
  const all = new Map([...save.scores, ...(other.scores ?? [])].map((s) => [id(s), s]))
  save.scores = []
  for (const s of [...all.values()].sort(better)) {
    const n = save.scores.filter((x) => x.env === s.env && modeOf(x) === modeOf(s)).length
    if (n < HIGHSCORES) save.scores.push(s)
  }
  recount(save)
}

export function emptySave(): SaveData {
  return { version: 1, coins: 0, ledger: {}, deviceId: newDeviceId(), levels: {}, best: {}, unlocked: [], envId: 'meadow', vehicleId: 'runabout', players: ['Wille'], playerBest: {}, scores: [], modeId: 'endless', playerTimes: {} }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptySave()
    const data = JSON.parse(raw)
    if (data?.version !== 1) return emptySave()
    const save: SaveData = { ...emptySave(), ...data }
    // Saves from before cloud sync kept a plain coin count: it becomes this device's earnings.
    if (!data.ledger) save.ledger = { [save.deviceId]: { earned: Math.max(0, data.coins ?? 0), spent: 0 } }
    recount(save)
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
