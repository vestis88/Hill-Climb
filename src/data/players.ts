/** The family's players, in the order they take turns. Each has a colour for their ghost. */
export const PLAYERS = [
  { name: 'Wille', colour: '#4c97f5' },
  { name: 'Frans', colour: '#ff8a2a' },
  { name: 'Johan', colour: '#b46cf0' },
  { name: 'Bim', colour: '#2ec98b' },
] as const

export type PlayerName = (typeof PLAYERS)[number]['name']

/**
 * Colours a player can choose (Utstyrsel): their vehicle's paint, helmet, ghost and name. Each
 * player has their own; two players never share one, so ghosts and duels stay easy to tell apart.
 */
export const COLOURS = [
  '#4c97f5', '#ff8a2a', '#b46cf0', '#2ec98b', '#e5383b', '#ffd23f', '#ff6fae',
  '#1fb8c8', '#8fd14f', '#a0703c', '#3a4fb8', '#e8ecf2', '#3a3f4a', '#d9a520',
]

/** Colours chosen on this device (from the save), by player. */
let chosen: Record<string, string> = {}
export function setPlayerColours(colours: Record<string, string> | undefined): void {
  chosen = { ...colours }
}

/** A player's colour: the one they chose, or their own default. */
export const playerColour = (name: string) => chosen[name] ?? PLAYERS.find((p) => p.name === name)?.colour ?? '#ffffff'

/** Swedish genitive: "Willes", but "Frans" stays "Frans" (names ending in s, x or z). */
export const genitive = (name: string) => (/[sxz]$/i.test(name) ? name : `${name}s`)
