/** The family's players, in the order they take turns. Each has a colour for their ghost. */
export const PLAYERS = [
  { name: 'Wille', colour: '#4c97f5' },
  { name: 'Frans', colour: '#ff8a2a' },
  { name: 'Johan', colour: '#b46cf0' },
  { name: 'Bim', colour: '#2ec98b' },
] as const

export type PlayerName = (typeof PLAYERS)[number]['name']

export const playerColour = (name: string) => PLAYERS.find((p) => p.name === name)?.colour ?? '#ffffff'
