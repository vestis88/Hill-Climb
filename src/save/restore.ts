import { ENVIRONMENTS } from '../data/environments'
import { LEVELS } from '../data/klurbanor'
import { MAX_LEVEL } from '../data/upgrades'
import { VEHICLES } from '../data/vehicles'
import { earn, levelsFor, type SaveData } from './save'

/**
 * Giving back progress that was lost (Settings, test mode only): roughly what the family had,
 * typed in by hand. It only ever adds: coins on top, unlocks added, levels raised, never lowered.
 */
export interface Restore {
  /** Coins to add. */
  coins: number
  /** Unlock every vehicle and map. */
  unlockAll: boolean
  /** Klurbanor done, counted from the first. */
  klur: number
  /** Raise every upgrade on every vehicle to at least this level (1 leaves them). */
  level: number
}

export function restoreProgress(save: SaveData, r: Restore): void {
  const add = (id: string) => {
    if (!save.unlocked.includes(id)) save.unlocked.push(id)
  }
  if (r.coins > 0) earn(save, r.coins)
  if (r.unlockAll) for (const item of [...VEHICLES, ...ENVIRONMENTS]) if (item.price > 0) add(item.id)
  for (const l of LEVELS.slice(0, Math.max(0, Math.floor(r.klur)))) add(`klur:${l.id}`)
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(r.level)))
  if (level > 1) {
    for (const v of VEHICLES) {
      const levels = levelsFor(save, v.id)
      for (const u of v.upgrades) levels[u.id] = Math.max(levels[u.id], level)
      save.levels[v.id] = levels
    }
  }
}
