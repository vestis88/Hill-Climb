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
    return ease * (grow * (rolling + crest) + bumps)
  }
}
