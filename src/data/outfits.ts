/**
 * Pip's outfit, per player: the helmet in the player's own colour, a helmet pattern and a hat.
 * Free to pick (owner: no paying for the look); only the gold-star pattern is earned, by finding
 * all three hidden stars on a map.
 */
export type Pattern = 'stripe' | 'stars' | 'checks' | 'flames' | 'goldstars'
export type Hat = 'none' | 'cap' | 'cowboy' | 'santa' | 'viking' | 'crown'

export interface Outfit {
  /** Helmet colour (the player's colour). */
  colour: string
  pattern: Pattern
  hat: Hat
}

export const PATTERNS: { id: Pattern; name: string; price: number }[] = [
  { id: 'stripe', name: 'Rand', price: 0 },
  { id: 'stars', name: 'Stjärnor', price: 0 },
  { id: 'checks', name: 'Rutor', price: 0 },
  { id: 'flames', name: 'Flammor', price: 0 },
  // Not for sale: found by collecting all three hidden stars on a map (game/stars.ts).
  { id: 'goldstars', name: 'Guldstjärnor', price: -1 },
]

export const HATS: { id: Hat; name: string; price: number }[] = [
  { id: 'none', name: 'Ingen hatt', price: 0 },
  { id: 'cap', name: 'Keps', price: 0 },
  { id: 'cowboy', name: 'Cowboyhatt', price: 0 },
  { id: 'santa', name: 'Tomteluva', price: 0 },
  { id: 'viking', name: 'Vikingahorn', price: 0 },
  { id: 'crown', name: 'Krona', price: 0 },
]

export const DEFAULT_OUTFIT: Omit<Outfit, 'colour'> = { pattern: 'stripe', hat: 'none' }
