/**
 * Pip's outfit, per player: the helmet in the player's own colour, a helmet pattern and a hat.
 * Patterns and hats are bought with coins once for the family (kept in save.unlocked as
 * "pattern:stars", "hat:crown", so they sync like other unlocks) and each player picks theirs.
 */
export type Pattern = 'stripe' | 'stars' | 'checks' | 'flames'
export type Hat = 'none' | 'cap' | 'cowboy' | 'santa' | 'viking' | 'crown'

export interface Outfit {
  /** Helmet colour (the player's colour). */
  colour: string
  pattern: Pattern
  hat: Hat
}

export const PATTERNS: { id: Pattern; name: string; price: number }[] = [
  { id: 'stripe', name: 'Rand', price: 0 },
  { id: 'stars', name: 'Stjärnor', price: 600 },
  { id: 'checks', name: 'Rutor', price: 900 },
  { id: 'flames', name: 'Flammor', price: 1200 },
]

export const HATS: { id: Hat; name: string; price: number }[] = [
  { id: 'none', name: 'Ingen hatt', price: 0 },
  { id: 'cap', name: 'Keps', price: 800 },
  { id: 'cowboy', name: 'Cowboyhatt', price: 1500 },
  { id: 'santa', name: 'Tomteluva', price: 1500 },
  { id: 'viking', name: 'Vikingahorn', price: 2500 },
  { id: 'crown', name: 'Krona', price: 5000 },
]

export const DEFAULT_OUTFIT: Omit<Outfit, 'colour'> = { pattern: 'stripe', hat: 'none' }
