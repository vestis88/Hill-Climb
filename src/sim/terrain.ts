import { Body, Chain, Fixture, Vec2, World } from 'planck'
import type { HeightFn } from './types'

export const TERRAIN_FRICTION = 0.9

/** Metres of terrain per streamed chunk, and the spacing of its points. */
const CHUNK = 64
const STEP = 0.5

/**
 * Streams the ground as the car moves: chunks are built ahead of the car and dropped
 * far behind it. The height function is deterministic, so a dropped chunk rebuilds
 * exactly the same if the car reverses into it.
 */
export class TerrainStreamer {
  readonly body: Body
  private readonly chunks = new Map<number, Fixture>()

  constructor(
    world: World,
    private readonly height: HeightFn,
    private readonly friction = TERRAIN_FRICTION,
  ) {
    this.body = world.createBody()
  }

  /** Make sure the ground exists from fromX to toX, and drop chunks outside it. */
  ensure(fromX: number, toX: number): void {
    const first = Math.floor(fromX / CHUNK)
    const last = Math.floor(toX / CHUNK)
    for (const [k, fixture] of this.chunks) {
      if (k < first || k > last) {
        this.body.destroyFixture(fixture)
        this.chunks.delete(k)
      }
    }
    for (let k = first; k <= last; k++) if (!this.chunks.has(k)) this.chunks.set(k, this.build(k))
  }

  private build(k: number): Fixture {
    const h = this.height
    const x0 = k * CHUNK
    const points: Vec2[] = []
    for (let i = 0; i <= CHUNK / STEP; i++) {
      const x = x0 + i * STEP
      points.push(new Vec2(x, h(x)))
    }
    const chain = new Chain(points, false)
    // Neighbouring points let wheels roll across chunk joins without catching.
    chain.setPrevVertex(new Vec2(x0 - STEP, h(x0 - STEP)))
    chain.setNextVertex(new Vec2(x0 + CHUNK + STEP, h(x0 + CHUNK + STEP)))
    return this.body.createFixture(chain, { friction: this.friction })
  }
}

export const flat: HeightFn = () => 0

/** Smooth 0..1 step between a and b. */
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Test track: a flat start, then terrain that gets harder with distance.
 * Layers: long rolling hills, medium hills, sharp crests that throw the car
 * into the air, and short bumps that unsettle the suspension.
 * Task P4 replaces this with the streamed, seeded generator.
 */
export const testHills: HeightFn = (x) => {
  if (x < 15) return 0
  const d = x - 15
  const ease = smoothstep(0, 30, d)
  const grow = 1 + d / 300
  const rolling = 2.6 * Math.sin(d * 0.07) + 1.4 * Math.sin(d * 0.17 + 1.3)
  // Narrow peaks of a raised sine: steep take-off faces and sharp crests.
  const crests = 2.2 * Math.pow(Math.max(0, Math.sin(d * 0.052 + 2.1)), 5) * smoothstep(40, 120, d)
  const bumps = 0.22 * Math.sin(d * 1.3) * Math.sin(d * 0.11) * smoothstep(60, 200, d)
  return ease * (grow * (rolling + crests) + bumps)
}

/** Shape of an environment's terrain. Heights in metres, distances in metres. */
export interface TerrainParams {
  /** Flat run-up before the hills start. */
  flatStart: number
  /** Height of the main rolling hills at the start. */
  amplitude: number
  /** Typical distance between main hilltops. */
  wavelength: number
  /** Height of the sharp crests that throw the car into the air. */
  crests: number
  /** Height of the short bumps. */
  bumps: number
  /** How much taller everything gets per kilometre... */
  growPerKm: number
  /** ...up to this many times the starting size, so the track stays drivable for ever. */
  maxGrow: number
  /** Kicker ramps that launch the car: a ramp steepening to a lip, then a drop. */
  jumps?: {
    /** One possible jump per this many metres... */
    spacing: number
    /** ...each present with this chance. */
    chance: number
    /** Lip height at the start, metres (grows with distance like the hills). */
    height: number
    /** Length of the ramp up to the lip, metres. */
    ramp: number
    /** No jumps before this distance. */
    from: number
  }
}

/** Seeded smooth noise in -1..1, a pure function of x: the same x always gives the same value. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x)
  const t = x - i
  const u = t * t * (3 - 2 * t)
  return lattice(i, seed) * (1 - u) + lattice(i + 1, seed) * u
}

function lattice(i: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}

/** Endless terrain: same parameters and seed, same hills, every run. */
export function makeTerrain(p: TerrainParams, seed: number): HeightFn {
  return (x) => {
    if (x < p.flatStart) return 0
    const d = x - p.flatStart
    const ease = smoothstep(0, 30, d)
    const grow = Math.min(p.maxGrow, 1 + (d / 1000) * p.growPerKm)
    const w = p.wavelength
    const rolling = p.amplitude * (noise(d / w, seed) + 0.45 * noise(d / (w * 0.42), seed + 1))
    const crest = p.crests * Math.pow(Math.max(0, noise(d / (w * 0.8), seed + 2)), 3) * smoothstep(40, 140, d)
    const bumps = p.bumps * noise(d / 2.2, seed + 3) * smoothstep(60, 220, d)
    const piece = setPieceAt(seed, d)
    return ease * (grow * (rolling + crest) + bumps) + (piece ? pieceHeight(piece, d - piece.start, grow) : kicker(p, seed, d, grow))
  }
}

/**
 * Set pieces keep long runs interesting: from 250 m on, one may sit in every 300 m stretch, picked
 * by the seed. Each is a shape added on top of the hills, and plain kickers are left out inside it.
 * - double: two kickers in a row;
 * - table: a wooden table-top (ramp, flat deck, ramp), drawn as a wooden bridge;
 * - whoops: five quick rollers in a row;
 * - wall: a steep bank up to a short plateau, then a gentle way down.
 */
export type SetPieceKind = 'double' | 'table' | 'whoops' | 'wall'
export interface SetPiece {
  kind: SetPieceKind
  /** Start and length along the track, metres from the end of the starting flat. */
  start: number
  length: number
}

const PIECE_FROM = 250
const PIECE_SPACING = 300
const PIECE_LENGTH: Record<SetPieceKind, number> = { double: 36, table: 32, whoops: 30, wall: 28 }
const PIECE_KINDS: SetPieceKind[] = ['double', 'table', 'whoops', 'wall']

/** The set piece in the i-th 300 m stretch, if there is one. */
function pieceIn(seed: number, i: number): SetPiece | null {
  if ((i + 1) * PIECE_SPACING <= PIECE_FROM || (lattice(i, seed + 21) + 1) / 2 > 0.7) return null
  const kind = PIECE_KINDS[Math.min(3, Math.floor(((lattice(i, seed + 22) + 1) / 2) * 4))]
  const length = PIECE_LENGTH[kind]
  const start = Math.max(PIECE_FROM, i * PIECE_SPACING + 20 + ((lattice(i, seed + 23) + 1) / 2) * (PIECE_SPACING - length - 40))
  return { kind, start, length }
}

/** The set piece covering distance d (from the end of the starting flat), if any. */
export function setPieceAt(seed: number, d: number): SetPiece | null {
  if (d < PIECE_FROM) return null
  const p = pieceIn(seed, Math.floor(d / PIECE_SPACING))
  return p && d >= p.start && d < p.start + p.length ? p : null
}

/** Every set piece overlapping the distances from..to (for drawing). */
export function setPiecesBetween(seed: number, from: number, to: number): SetPiece[] {
  const out: SetPiece[] = []
  for (let i = Math.max(0, Math.floor(from / PIECE_SPACING)); i <= Math.floor(to / PIECE_SPACING); i++) {
    const p = pieceIn(seed, i)
    if (p && p.start + p.length > from && p.start < to) out.push(p)
  }
  return out
}

const ramp = (u: number, len: number, h: number) => h * (u / len) ** 2
const ease01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** Height a set piece adds at u metres into it. */
function pieceHeight(p: SetPiece, u: number, grow: number): number {
  const g = Math.sqrt(grow)
  switch (p.kind) {
    case 'double': {
      // Two kickers: 7 m up to the lip, 4 m drop, a 7 m gap, and again (the second a bit bigger).
      const kick = (v: number, h: number) => (v <= 0 || v >= 11 ? 0 : v < 7 ? ramp(v, 7, h) : h * (1 - ease01((v - 7) / 4)))
      return kick(u, 1.1 * g) + kick(u - 18, 1.35 * g)
    }
    case 'table': {
      // 9 m up, a 14 m flat deck, 9 m down.
      const h = 1.5 * g
      return u < 9 ? h * ease01(u / 9) : u < 23 ? h : h * (1 - ease01((u - 23) / 9))
    }
    case 'whoops':
      // Five rollers, 6 m each.
      return 0.55 * g * Math.sin((Math.PI * u) / 6) ** 2
    case 'wall': {
      // A steep 8 m bank up, a 6 m plateau, then 14 m gently down.
      const h = 2.0 * g
      return u < 8 ? h * ease01(u / 8) : u < 14 ? h : h * (1 - ease01((u - 14) / 14))
    }
  }
}

/** Height added by a kicker ramp at distance d (0 away from jumps). */
function kicker(p: TerrainParams, seed: number, d: number, grow: number): number {
  const j = p.jumps
  if (!j || d < j.from) return 0
  const i = Math.floor(d / j.spacing)
  if ((lattice(i, seed + 11) + 1) / 2 > j.chance) return 0
  const drop = j.ramp * 0.55
  // Place the jump inside its slot, clear of the slot edges.
  const start = i * j.spacing + 4 + ((lattice(i, seed + 12) + 1) / 2) * (j.spacing - j.ramp - drop - 8)
  const u = d - start
  if (u <= 0 || u >= j.ramp + drop) return 0
  const h = j.height * (0.75 + 0.5 * ((lattice(i, seed + 13) + 1) / 2)) * Math.sqrt(grow)
  // Up: a curve that is flat at the foot and steepest at the lip, so it throws the car up.
  if (u < j.ramp) return h * (u / j.ramp) ** 2
  // Down: a quick smooth drop back to the ground.
  const t = (u - j.ramp) / drop
  return h * (1 - t * t * (3 - 2 * t))
}
