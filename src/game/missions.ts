/**
 * Uppdrag (missions): every player has three at a time, each done within a single run, each
 * paying coins. A finished mission is replaced by a new one. Plain data and functions, tested in
 * tests/missions.test.ts.
 */
export type MissionKind = 'backflips' | 'frontflips' | 'air' | 'wheelie' | 'distance' | 'coins' | 'combo'

export interface Mission {
  kind: MissionKind
  target: number
  /** distance missions: on this map (environment id). */
  env?: string
  reward: number
}

/** What a run did, for checking missions. */
export interface RunStats {
  backflips: number
  frontflips: number
  airSeconds: number
  longestWheelie: number
  distance: number
  env: string
  coins: number
  maxCombo: number
}

/** Targets and rewards per kind, easiest first. */
const LADDER: Record<MissionKind, [number, number][]> = {
  backflips: [[1, 100], [2, 200], [3, 350]],
  frontflips: [[1, 120], [2, 250]],
  air: [[3, 100], [6, 200], [10, 350]],
  wheelie: [[25, 120], [60, 250], [120, 450]],
  distance: [[300, 150], [600, 300], [1000, 500]],
  coins: [[100, 100], [250, 200], [500, 350]],
  combo: [[2, 150], [3, 250], [4, 400]],
}
const KINDS = Object.keys(LADDER) as MissionKind[]

/** A new mission, different in kind from the ones the player has. */
export function newMission(have: Mission[], maps: string[], random: () => number = Math.random): Mission {
  const free = KINDS.filter((k) => !have.some((m) => m.kind === k))
  const kind = free[Math.floor(random() * free.length)] ?? 'distance'
  const steps = LADDER[kind]
  const [target, reward] = steps[Math.floor(random() * steps.length)]
  return kind === 'distance' ? { kind, target, reward, env: maps[Math.floor(random() * maps.length)] } : { kind, target, reward }
}

export function fillMissions(have: Mission[], maps: string[], random: () => number = Math.random): Mission[] {
  const out = [...have]
  while (out.length < 3) out.push(newMission(out, maps, random))
  return out
}

/** How far a run got towards a mission, 0..target. */
export function progress(m: Mission, s: RunStats): number {
  const v = {
    backflips: s.backflips,
    frontflips: s.frontflips,
    air: s.airSeconds,
    wheelie: s.longestWheelie,
    distance: m.env === undefined || m.env === s.env ? s.distance : 0,
    coins: s.coins,
    combo: s.maxCombo,
  }[m.kind]
  return Math.min(m.target, v)
}

export const done = (m: Mission, s: RunStats) => progress(m, s) >= m.target

/** The mission in words, e.g. "2 bakåtvolter i ett åk". */
export function describe(m: Mission, mapName: (id: string) => string): string {
  switch (m.kind) {
    case 'backflips': return m.target === 1 ? 'En bakåtvolt' : `${m.target} bakåtvolter i ett åk`
    case 'frontflips': return m.target === 1 ? 'En framåtvolt' : `${m.target} framåtvolter i ett åk`
    case 'air': return `${m.target} s i luften i ett åk`
    case 'wheelie': return `Stegring ${m.target} m`
    case 'distance': return `Kör ${m.target} m på ${mapName(m.env ?? '')}`
    case 'coins': return `${m.target} mynt i ett åk`
    case 'combo': return `Kombo med ${m.target} trick`
  }
}
