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
}

const KEY = 'ridgeline.save'

export function emptySave(): SaveData {
  return { version: 1, coins: 0, levels: {}, best: {}, unlocked: [], envId: 'meadow', vehicleId: 'runabout' }
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
