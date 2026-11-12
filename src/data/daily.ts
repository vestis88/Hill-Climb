import { environment, heightFor, type Environment } from './environments'
import { BASE_LEVELS, type Levels, type UpgradeId } from './upgrades'
import { VEHICLES } from './vehicles'
import { pickAtmosphere, WEATHER_GRIP, type Atmosphere } from './weather'
import { TERRAIN_FRICTION } from '../sim/terrain'

/**
 * Dagens utmaning (the daily challenge): a new track every day, the same on every device,
 * rebuilt from the date alone, so nothing about the track needs saving.
 *
 * The date picks, in layers that are each known to drive well:
 * - a base map (weighted, so the hardest maps come up less often): its look, gravity, grip,
 *   puddles and terrain;
 * - a terrain style that scales the map's hills, crests, bumps and jumps within safe ranges;
 * - a small jitter on top, and the track's seed;
 * - the time of day and weather (data/weather.ts): rain and snow cut the grip.
 * Then two events on that track: a 500 m race and an endless run, each with its own vehicle
 * (two different ones) at a balanced tuning that is the same for everyone (it ignores the
 * family's own upgrades). A track that comes out too steep is never used: the next variant
 * of the same date is tried instead (tests/daily.test.ts drives a year of them).
 */

export interface DailyEvent {
  vehicle: string
  levels: Levels
}

export interface Daily {
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Where today's records are kept (bests, ghosts, highscores): "daily-2026-11-12". */
  id: string
  style: string
  /** Time of day and weather. Rain and snow make the ground slippery (already in env's grip). */
  atmosphere: Atmosphere
  /** The track: a base map's look and physics with today's terrain and the weather's grip. */
  env: Environment
  race: DailyEvent
  endless: DailyEvent
}

/** Base maps and how often they come up. */
const BASES: [string, number][] = [['meadow', 3], ['crater', 2], ['frost', 2], ['dunes', 2], ['canyon', 1], ['woods', 2]]

interface Style {
  name: string
  amplitude: number
  wavelength: number
  crests: number
  bumps: number
  /** Scales the chance of each jump (and its height a little). */
  jumps: number
}
const STYLES: Style[] = [
  { name: 'Långa vågor', amplitude: 1.15, wavelength: 1.4, crests: 0.7, bumps: 0.6, jumps: 0.7 },
  { name: 'Guppig', amplitude: 0.85, wavelength: 0.9, crests: 0.85, bumps: 1.5, jumps: 0.8 },
  { name: 'Hoppark', amplitude: 0.9, wavelength: 1.1, crests: 0.9, bumps: 0.8, jumps: 1.35 },
  { name: 'Branta backar', amplitude: 1.15, wavelength: 0.95, crests: 1.1, bumps: 1, jumps: 0.6 },
  { name: 'Lugn', amplitude: 0.85, wavelength: 1.15, crests: 0.75, bumps: 0.7, jumps: 0.8 },
]

/** Integer hash of a string and a salt to 0..1. */
function rand(text: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const pick = <T>(items: [T, number][], r: number): T => {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let x = r * total
  for (const [item, w] of items) if ((x -= w) < 0) return item
  return items[items.length - 1][0]
}

export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The steepest ground over the first `length` metres (rise over run across 2 m). */
export function steepest(env: Environment, length = 2500): number {
  const h = heightFor(env)
  let max = 0
  for (let x = 0; x < length; x += 1) max = Math.max(max, Math.abs(h(x + 2) - h(x)) / 2)
  return max
}

/** How steep a base map gets; a daily track may not be steeper than its base map plus a little. */
const baseSteepest = new Map<string, number>()
function steepLimit(base: Environment): number {
  if (!baseSteepest.has(base.id)) baseSteepest.set(base.id, steepest(base))
  return baseSteepest.get(base.id)! * 1.08
}

function variant(date: string, attempt: number): { env: Environment; style: string } {
  const salt = attempt * 100
  const base = environment(pick(BASES, rand(date, salt + 1)))
  const style = STYLES[Math.floor(rand(date, salt + 2) * STYLES.length)]
  const jitter = (k: number) => 1 + (rand(date, salt + k) - 0.5) * 0.16
  const t = base.terrain
  const terrain = {
    ...t,
    amplitude: t.amplitude * style.amplitude * jitter(3),
    wavelength: t.wavelength * style.wavelength * jitter(4),
    crests: t.crests * style.crests * jitter(5),
    bumps: t.bumps * style.bumps,
    jumps: t.jumps && {
      ...t.jumps,
      chance: Math.min(0.9, t.jumps.chance * style.jumps),
      height: t.jumps.height * Math.min(1.1, 0.9 + 0.15 * style.jumps),
    },
  }
  const seed = 1000 + Math.floor(rand(date, salt + 6) * 1e6)
  return { env: { ...base, seed, terrain, variant: `${date}#${attempt}` }, style: style.name }
}

/** A balanced tuning: every upgrade around level 5 (3 to 7), always adding up to the same total. */
function tuning(date: string, salt: number, upgrades: UpgradeId[]): Levels {
  const levels: Levels = { ...BASE_LEVELS }
  for (const u of upgrades) levels[u] = 5
  for (let i = 0; i < 3; i++) {
    const from = upgrades[Math.floor(rand(date, salt + i * 2) * upgrades.length)]
    const to = upgrades[Math.floor(rand(date, salt + i * 2 + 1) * upgrades.length)]
    if (from !== to && levels[from] > 3 && levels[to] < 7) {
      levels[from]--
      levels[to]++
    }
  }
  return levels
}

const cache = new Map<string, Daily>()

/** The daily challenge for a date (default today, local time). */
export function dailyFor(day: Date | string = new Date()): Daily {
  const date = typeof day === 'string' ? day : dateKey(day)
  const hit = cache.get(date)
  if (hit) return hit
  // The first variant that is no steeper than its base map; the base map itself as a last resort.
  let chosen: { env: Environment; style: string } | null = null
  for (let attempt = 0; attempt < 8 && !chosen; attempt++) {
    const v = variant(date, attempt)
    if (steepest(v.env) <= steepLimit(environment(v.env.id))) chosen = v
  }
  chosen ??= { env: { ...environment('meadow'), variant: `${date}#base` }, style: 'Klassisk' }
  const first = Math.floor(rand(date, 50) * VEHICLES.length)
  const second = (first + 1 + Math.floor(rand(date, 51) * (VEHICLES.length - 1))) % VEHICLES.length
  const event = (i: number, salt: number): DailyEvent => {
    const v = VEHICLES[i]
    return { vehicle: v.id, levels: tuning(date, salt, v.upgrades.map((u) => u.id)) }
  }
  let salt = 80
  const atmosphere = pickAtmosphere(chosen.env, () => rand(date, salt++))
  const grip = (chosen.env.groundFriction ?? TERRAIN_FRICTION) * WEATHER_GRIP[atmosphere.weather]
  const env = { ...chosen.env, groundFriction: grip }
  const daily: Daily = { date, id: `daily-${date}`, style: chosen.style, atmosphere, env, race: event(first, 60), endless: event(second, 70) }
  cache.set(date, daily)
  return daily
}

/** True for record keys and ids of a daily challenge older than `keepDays` before `today`. */
export function oldDaily(key: string, today: string, keepDays = 14): boolean {
  const m = /^daily-(\d{4})-(\d{2})-(\d{2})/.exec(key)
  if (!m) return false
  const then = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const [y, mo, d] = today.split('-').map(Number)
  return (Date.UTC(y, mo - 1, d) - then) / 86400000 > keepDays
}
