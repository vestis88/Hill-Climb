import { BASE_LEVELS, type Levels } from '../data/upgrades'

/** Everything kept between sessions. Stored in this browser only. */
export interface SaveData {
  version: 1
  coins: number
  /** Upgrade levels per vehicle id. */
  levels: Record<string, Levels>
  /** Best distance per track id, metres. */
  best: Record<string, number>
}

const KEY = 'ridgeline.save'

export function emptySave(): SaveData {
  return { version: 1, coins: 0, levels: {}, best: {} }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptySave()
    const data = JSON.parse(raw)
    if (data?.version !== 1) return emptySave()
    return { ...emptySave(), ...data }
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
