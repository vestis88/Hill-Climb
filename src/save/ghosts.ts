import type { SimState } from '../sim/types'

/**
 * Ghost riders: a run recorded as poses, 15 times a second, and replayed as a see-through
 * vehicle. Poses (not inputs) are stored, so a ghost still plays back the same after the
 * physics is retuned. Stored per player and environment: their best run and their last run.
 *
 * Each frame is the chassis (x, y, angle) and, per wheel, its hub in chassis coordinates and
 * its spin angle. Values are rounded to whole centimetres, millimetres for hubs and
 * hundredths of a radian, then delta-encoded, so a two-minute run is about 50 KB.
 */
export const GHOST_HZ = 15
/** Sim steps (60 Hz) per ghost frame. */
export const GHOST_EVERY = 60 / GHOST_HZ
/** Longest recording kept, seconds; past that the ghost stops where it was. */
const MAX_SECONDS = 300

export interface Ghost {
  v: 1
  player: string
  vehicle: string
  /** Record key: the environment, plus the mode for races (data/modes.ts recordKey). */
  env: string
  distance: number
  /** Race time in seconds, for a finished race. */
  time?: number
  /** When it was recorded (ms since 1970), so the newest "last" ghost wins when syncing. */
  at?: number
  wheels: number
  /** Delta-encoded integers, `stride` per frame. */
  data: number[]
}

/** A ghost's pose at one moment, ready to draw. */
export interface GhostPose {
  chassis: { x: number; y: number; angle: number }
  /** Wheel hubs in chassis coordinates, and wheel spin angles. */
  hubs: [number, number][]
  wheelAngles: number[]
  /** 1 while the ghost is running; fades to 0 after its run ended. */
  fade: number
}

const SCALE = { pos: 100, hub: 1000, angle: 100 }
const stride = (wheels: number) => 3 + wheels * 3

/** Records a run as it is driven. Call `sample` after every sim step. */
export class GhostRecorder {
  private raw: number[] = []
  private steps = 0

  constructor(private readonly wheels: number) {}

  sample(s: SimState): void {
    if (this.steps++ % GHOST_EVERY !== 0) return
    if (this.raw.length / stride(this.wheels) >= MAX_SECONDS * GHOST_HZ) return
    const c = Math.cos(s.chassis.angle)
    const sn = Math.sin(s.chassis.angle)
    this.raw.push(Math.round(s.chassis.x * SCALE.pos), Math.round(s.chassis.y * SCALE.pos), Math.round(s.chassis.angle * SCALE.angle))
    for (const w of s.wheels.slice(0, this.wheels)) {
      const dx = w.x - s.chassis.x
      const dy = w.y - s.chassis.y
      this.raw.push(Math.round((dx * c + dy * sn) * SCALE.hub), Math.round((-dx * sn + dy * c) * SCALE.hub), Math.round(w.angle * SCALE.angle))
    }
  }

  finish(meta: { player: string; vehicle: string; env: string; distance: number; time?: number }): Ghost {
    const n = stride(this.wheels)
    const data = this.raw.map((v, i) => (i < n ? v : v - this.raw[i - n]))
    return { v: 1, ...meta, at: Date.now(), wheels: this.wheels, data }
  }
}

/** A decoded ghost, ready to sample at any time. */
export class GhostTrack {
  private readonly frames: Float64Array
  readonly count: number
  private readonly n: number

  constructor(readonly ghost: Ghost) {
    this.n = stride(ghost.wheels)
    const values = new Float64Array(ghost.data.length)
    for (let i = 0; i < ghost.data.length; i++) values[i] = ghost.data[i] + (i >= this.n ? values[i - this.n] : 0)
    this.frames = values
    this.count = Math.floor(values.length / this.n)
  }

  /** Seconds the recording lasts. */
  get duration(): number {
    return Math.max(0, this.count - 1) / GHOST_HZ
  }

  /** The pose `t` seconds into the run, between recorded frames. */
  at(t: number): GhostPose | null {
    if (this.count === 0) return null
    const f = Math.max(0, Math.min(this.count - 1, t * GHOST_HZ))
    const i = Math.min(this.count - 2, Math.floor(f))
    const k = this.count < 2 ? 0 : f - Math.max(0, i)
    const a = Math.max(0, i) * this.n
    const b = Math.min(this.count - 1, Math.max(0, i) + 1) * this.n
    const v = (j: number) => this.frames[a + j] + (this.frames[b + j] - this.frames[a + j]) * k
    const hubs: [number, number][] = []
    const wheelAngles: number[] = []
    for (let w = 0; w < this.ghost.wheels; w++) {
      const o = 3 + w * 3
      hubs.push([v(o) / SCALE.hub, v(o + 1) / SCALE.hub])
      wheelAngles.push(v(o + 2) / SCALE.angle)
    }
    return {
      chassis: { x: v(0) / SCALE.pos, y: v(1) / SCALE.pos, angle: v(2) / SCALE.angle },
      hubs,
      wheelAngles,
      fade: Math.max(0, Math.min(1, 1 - (t - this.duration))),
    }
  }
}

const key = (player: string, env: string, kind: 'best' | 'last') => `ridgeline.ghost.${player}.${env}.${kind}`

/**
 * How a ghost is stored and synced: the same fields, with the numbers packed as zigzag varints
 * of the change from frame to frame (most fit in one byte) and base64: under half the size of a
 * JSON number list, so more than twice as many ghosts fit in the browser's storage. Ghosts stored the old way still load.
 */
interface PackedGhost extends Omit<Ghost, 'v' | 'data'> {
  v: 2
  packed: string
}

export function packGhost(g: Ghost): PackedGhost {
  // The data are already changes from the previous frame; motion is smooth, so the change in
  // that change is smaller still. Store that (the first two frames as they are).
  const n = stride(g.wheels)
  const second = g.data.map((v, i) => (i < 2 * n ? v : v - g.data[i - n]))
  const bytes: number[] = []
  for (const n of second) {
    let z = n >= 0 ? n * 2 : -n * 2 - 1
    while (z >= 0x80) {
      bytes.push((z % 0x80) | 0x80)
      z = Math.floor(z / 0x80)
    }
    bytes.push(z)
  }
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x4000) text += String.fromCharCode(...bytes.slice(i, i + 0x4000))
  const { data: _data, v: _v, ...meta } = g
  return { ...meta, v: 2, packed: btoa(text) }
}

/** A ghost from storage or the cloud, packed or the old plain form; null if it is not one. */
export function unpackGhost(raw: unknown): Ghost | null {
  // Either shape: the old plain one (v 1, data) or the packed one (v 2, packed).
  const g = raw as { v?: number; data?: unknown; packed?: unknown } | null
  if (!g || typeof g !== 'object') return null
  if (g.v === 1 && Array.isArray(g.data)) return g as Ghost
  if (g.v !== 2 || typeof g.packed !== 'string') return null
  const text = atob(g.packed)
  const data: number[] = []
  let z = 0
  let scale = 1
  for (let i = 0; i < text.length; i++) {
    const b = text.charCodeAt(i)
    z += (b & 0x7f) * scale
    if (b & 0x80) scale *= 0x80
    else {
      const n = stride((g as PackedGhost).wheels)
      const v = z % 2 ? -(z + 1) / 2 : z / 2
      data.push(data.length < 2 * n ? v : v + data[data.length - n])
      z = 0
      scale = 1
    }
  }
  const { packed: _packed, ...meta } = g as PackedGhost
  return { ...meta, v: 1, data }
}

const serialise = (g: Ghost) => JSON.stringify(packGhost(g))

export function loadGhost(player: string, env: string, kind: 'best' | 'last'): Ghost | null {
  try {
    const raw = localStorage.getItem(key(player, env, kind))
    if (!raw) return null
    return unpackGhost(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Keep a finished run as the player's last ghost, and as their best when it went further.
 * If the browser's storage is full, last-run ghosts are dropped first to make room.
 */
export function storeGhost(ghost: Ghost): void {
  const put = (kind: 'best' | 'last') => {
    const text = serialise(ghost)
    try {
      localStorage.setItem(key(ghost.player, ghost.env, kind), text)
      return true
    } catch {
      return false
    }
  }
  const best = loadGhost(ghost.player, ghost.env, 'best')
  // Races: the fastest finished run; endless: the furthest.
  const isBest = !best || betterGhost(ghost, best)
  if (isBest && !put('best')) {
    clearGhosts('last')
    put('best')
  }
  if (!put('last')) {
    clearGhosts('last')
    put('last')
  }
}

/**
 * Record key for a player's record in one vehicle: "meadow@scrambler", "meadow.race500@hauler".
 * Stored alongside the overall record, so players can race their best in the vehicle they picked.
 */
export const vehicleKey = (key: string, vehicle: string) => `${key}@${vehicle}`

/** Keep a finished run as the player's record in its vehicle when it beats the one stored. */
export function storeVehicleBest(ghost: Ghost): void {
  const env = vehicleKey(ghost.env, ghost.vehicle)
  const current = loadGhost(ghost.player, env, 'best')
  if (current && !betterGhost(ghost, current)) return
  if (!putGhost('best', { ...ghost, env })) {
    clearGhosts('last')
    putGhost('best', { ...ghost, env })
  }
}

/** True when ghost `a` should be kept over `b` as a best: the faster race, else the further run. */
export function betterGhost(a: { time?: number; distance: number }, b: { time?: number; distance: number }): boolean {
  if (a.time !== undefined || b.time !== undefined) return (a.time ?? Infinity) < (b.time ?? Infinity)
  return a.distance > b.distance
}

/** The best of several ghosts (fastest race, else furthest run), or null if there are none. */
export function bestOf(ghosts: (Ghost | null | undefined)[]): Ghost | null {
  let best: Ghost | null = null
  for (const g of ghosts) if (g && g.data.length && (!best || betterGhost(g, best))) best = g
  return best
}

const sameRun = (a: Ghost, b: Ghost) => a.player === b.player && a.distance === b.distance && a.time === b.time && a.data.length === b.data.length

/**
 * The ghosts for a turn in a round with several players: for every player in the round, their
 * latest run (this round's, else from the round before, else their saved last run) and their
 * record; and the overall record, also when its holder is not playing. Each run shows once.
 */
export function roundGhosts(
  players: string[],
  everyone: string[],
  thisRound: Ghost[],
  previous: Ghost[],
  stored: (player: string, kind: 'best' | 'last') => Ghost | null,
  /** The driver's record in the vehicle they are driving, shown too when it is a different run. */
  driver?: { player: string; vehicleBest: Ghost | null; vehicleName: string },
): { ghost: Ghost; label: string }[] {
  const overall = bestOf(everyone.map((p) => stored(p, 'best')))
  const out: { ghost: Ghost; label: string }[] = []
  const add = (g: Ghost | null | undefined, label: string) => {
    if (g && g.data.length && !out.some((o) => sameRun(o.ghost, g))) out.push({ ghost: g, label })
  }
  const recordLabel = (g: Ghost) => (overall && sameRun(g, overall) ? `Rekord · ${g.player}` : `${g.player} rekord`)
  for (const p of players) {
    const best = stored(p, 'best')
    const last = thisRound.find((g) => g.player === p) ?? previous.find((g) => g.player === p) ?? stored(p, 'last')
    if (best) add(best, recordLabel(best))
    if (driver && driver.player === p) add(driver.vehicleBest, `${p} rekord · ${driver.vehicleName}`)
    // The latest run can itself be the record: then it is labelled as the record.
    if (last) add(last, overall && sameRun(last, overall) ? `Rekord · ${p}` : `${p} senaste`)
  }
  if (overall) add(overall, `Rekord · ${overall.player}`)
  return out
}

export interface StoredGhost {
  player: string
  env: string
  kind: 'best' | 'last'
  ghost: Ghost
}

/** Every ghost stored on this device (for syncing). */
export function listGhosts(): StoredGhost[] {
  const out: StoredGhost[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('ridgeline.ghost.')) continue
      const kind = k.endsWith('.best') ? 'best' : k.endsWith('.last') ? 'last' : null
      const g = kind ? unpackGhost(JSON.parse(localStorage.getItem(k) ?? 'null')) : null
      if (kind && g) out.push({ player: g.player, env: g.env, kind, ghost: g })
    }
  } catch {
    // Storage unavailable.
  }
  return out
}

/** Store a ghost from another device as this device's best or last (no comparison). */
export function putGhost(kind: 'best' | 'last', ghost: Ghost): boolean {
  try {
    localStorage.setItem(key(ghost.player, ghost.env, kind), serialise(ghost))
    return true
  } catch {
    return false
  }
}

/** Remove stored ghosts: all of them, or only last-run ghosts. */
export function clearGhosts(only?: 'last'): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('ridgeline.ghost.') && (!only || k.endsWith('.last'))) localStorage.removeItem(k)
    }
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
