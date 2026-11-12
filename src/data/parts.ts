/**
 * Delar (parts): a second upgrade layer for when the upgrades are maxed. Each part is bought once
 * for the family (kept in save.unlocked as "part:<id>", so it syncs) and one part can be fitted to
 * each vehicle. Not used on the daily challenge, where everyone has the same tuning.
 */
export type PartId = 'none' | 'tank' | 'shocks' | 'magnet' | 'wheelie' | 'flips'

export const PARTS: { id: PartId; name: string; blurb: string; price: number }[] = [
  { id: 'none', name: 'Ingen del', blurb: '', price: 0 },
  { id: 'tank', name: 'Större tank', blurb: 'Bränslet räcker 30 % längre', price: 4000 },
  { id: 'shocks', name: 'Stötdämpare', blurb: 'Mjukare landningar', price: 4000 },
  { id: 'magnet', name: 'Myntmagnet', blurb: 'Plockar mynt på dubbla avståndet', price: 6000 },
  { id: 'wheelie', name: 'Stegringsmästare', blurb: '50 % mer för stegringar', price: 6000 },
  { id: 'flips', name: 'Voltbonus', blurb: '50 % mer för volter', price: 6000 },
]

/** How a part changes a run (1 = no change). */
export function partEffects(part: PartId | undefined) {
  return {
    fuel: part === 'tank' ? 1.3 : 1,
    pickupRadius: part === 'magnet' ? 2 : 1,
    wheelieCoins: part === 'wheelie' ? 1.5 : 1,
    flipCoins: part === 'flips' ? 1.5 : 1,
    /** Suspension: more damping, a little softer springs. */
    damping: part === 'shocks' ? 1.35 : 1,
    springs: part === 'shocks' ? 0.9 : 1,
  }
}
