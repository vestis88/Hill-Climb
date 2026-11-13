import type { HeightFn } from './types'

/**
 * Stuntbanan: a track where timing decides everything. Every 75 m or so comes a feature, picked
 * from a fixed pattern by the seed and growing harder with distance:
 * - gap: a lip, then a deep pit to jump; too slow and you fall in (the run ends);
 * - loop: a downhill run-up into a full loop (6 m radius, 7.6 m later on); too slow and you
 *   drop off at the top;
 * - seesaw: a plank on a pivot that tips as you cross it; take it slowly;
 * - cliff: a ramp up to a flat top and an edge with a big drop, then a climb back up;
 * - whoops: quick rollers that reward pumping the gas in rhythm.
 * The ground is a gentle roll between features. Loops and seesaws are physics bodies added by
 * the world (sim/world.ts) from `stuntObstacles`; this file shapes the ground and says where.
 */
export type StuntKind = 'gap' | 'loop' | 'seesaw' | 'cliff' | 'whoops'

export interface StuntFeature {
  kind: StuntKind
  /** Where it starts and how long it is, metres along the track. */
  start: number
  length: number
  /** Its number along the track (0 = first): later ones are bigger. */
  index: number
  /** Gap width, loop radius, cliff drop, whoop height: depends on the kind. */
  size: number
}

export type StuntObstacle =
  | { kind: 'loop'; id: string; cx: number; cy: number; r: number }
  | { kind: 'seesaw'; id: string; x: number; y: number; length: number }

const FIRST = 70
const SPACING = 78
const PATTERN: StuntKind[] = ['gap', 'loop', 'seesaw', 'whoops', 'gap', 'cliff', 'loop', 'gap', 'seesaw', 'loop', 'whoops', 'cliff']
const LOOP_RUNUP = 20
const LOOP_DROP = 4.5

function hash(i: number, salt: number): number {
  let h = Math.imul(i ^ Math.imul(salt + 0x2545f491, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

/** The i-th feature along the track. */
export function featureAt(i: number, seed: number): StuntFeature {
  const kind = PATTERN[(i + Math.floor(hash(Math.floor(i / PATTERN.length), seed) * PATTERN.length)) % PATTERN.length]
  const start = FIRST + i * SPACING + hash(i, seed + 1) * 10
  const grow = Math.min(1, i / 20)
  switch (kind) {
    case 'gap': {
      const width = 3.5 + grow * 5 + hash(i, seed + 2) * 1.5
      return { kind, start, length: 7 + width + 9, index: i, size: width }
    }
    case 'loop': {
      const r = 6 + grow * 1.6
      return { kind, start, length: LOOP_RUNUP + 2 * r + 6 + LOOP_RUNUP, index: i, size: r }
    }
    case 'seesaw':
      return { kind, start, length: 14, index: i, size: 8 }
    case 'cliff':
      return { kind, start, length: 12 + 24, index: i, size: 2.5 + grow * 2 }
    case 'whoops':
      return { kind, start, length: 30, index: i, size: 0.5 + grow * 0.4 }
  }
}

/** The feature covering distance d, if any. */
export function featureNear(d: number, seed: number): StuntFeature | null {
  const i = Math.floor((d - FIRST) / SPACING)
  for (const k of [i, i - 1]) {
    if (k < 0) continue
    const f = featureAt(k, seed)
    if (d >= f.start && d < f.start + f.length) return f
  }
  return null
}

/** Every feature overlapping from..to. */
export function featuresBetween(seed: number, from: number, to: number): StuntFeature[] {
  const out: StuntFeature[] = []
  for (let i = Math.max(0, Math.floor((from - FIRST) / SPACING) - 1); i <= Math.floor((to - FIRST) / SPACING) + 1; i++) {
    if (i < 0) continue
    const f = featureAt(i, seed)
    if (f.start + f.length > from && f.start < to) out.push(f)
  }
  return out
}

/** The ground between features: a gentle roll. */
function roll(x: number, seed: number): number {
  const s = (seed % 97) * 0.37
  return 1.1 * Math.sin(x / 23 + s) + 0.5 * Math.sin(x / 9.7 + s * 2)
}

/** Height a feature adds at u metres into it (relative to its baseline). */
function shape(f: StuntFeature, u: number): number {
  switch (f.kind) {
    case 'gap': {
      const w = f.size
      if (u < 7) return 0.9 * (u / 7) ** 2
      if (u < 7 + w) return -14
      return -0.3 + 0.3 * smooth((u - 7 - w) / 8)
    }
    case 'loop': {
      const flatEnd = LOOP_RUNUP + 2 * f.size + 6
      if (u < LOOP_RUNUP) return -LOOP_DROP * smooth(u / LOOP_RUNUP)
      if (u < flatEnd) return -LOOP_DROP
      return -LOOP_DROP * (1 - smooth((u - flatEnd) / LOOP_RUNUP))
    }
    case 'seesaw':
      return 0
    case 'cliff': {
      // Up a ramp to a flat top, off the edge, and a long climb back up.
      if (u < 8) return 2 * smooth(u / 8)
      if (u < 11) return 2
      if (u < 11.6) return 2 - (2 + f.size) * smooth((u - 11) / 0.6)
      return -f.size * (1 - smooth((u - 12) / 24))
    }
    case 'whoops':
      return f.size * Math.sin((Math.PI * u) / 5) ** 2
  }
}

/** The track's ground. Features sit on a level baseline, blended into the roll at their ends. */
export function stuntHeight(seed: number): HeightFn {
  return (x) => {
    if (x < 20) return 0
    const base = roll(x, seed) * smooth((x - 20) / 30)
    const f = featureNear(x, seed)
    // Ease into and out of each feature over a few metres so the edges are smooth.
    const near = f ?? featureNear(x + 6, seed) ?? featureNear(x - 6, seed)
    if (!near) return base
    const level = roll(near.start, seed) * smooth((near.start - 20) / 30)
    if (!f) {
      const t = x < near.start ? (near.start - x) / 6 : (x - near.start - near.length) / 6
      return level + (base - level) * smooth(t)
    }
    return level + shape(f, x - f.start)
  }
}

/** Below this line over a pit the vehicle has fallen in and the run ends; null elsewhere. */
export function stuntFallLine(seed: number): (x: number) => number | null {
  const h = stuntHeight(seed)
  return (x) => {
    const f = featureNear(x, seed)
    if (!f || f.kind !== 'gap') return null
    const u = x - f.start
    return u >= 6.5 && u <= 7.5 + f.size ? h(f.start) - 2.5 : null
  }
}

/** Places where a fuel can should not lie (in a pit, or in a loop). */
export function stuntAvoid(seed: number): (x: number) => boolean {
  return (x) => {
    const f = featureNear(x, seed)
    return !!f && (f.kind === 'gap' || f.kind === 'loop' || f.kind === 'seesaw')
  }
}

/** The loops and seesaws between two distances, as physics bodies to add. */
export function stuntObstacles(seed: number): (from: number, to: number) => StuntObstacle[] {
  const h = stuntHeight(seed)
  return (from, to) =>
    featuresBetween(seed, from, to).flatMap((f): StuntObstacle[] => {
      if (f.kind === 'loop') {
        const cx = f.start + LOOP_RUNUP + 3 + f.size
        return [{ kind: 'loop', id: `loop${f.index}`, cx, cy: h(cx) + f.size, r: f.size }]
      }
      if (f.kind === 'seesaw') {
        const x = f.start + 7
        return [{ kind: 'seesaw', id: `seesaw${f.index}`, x, y: h(x) + 1.25, length: f.size }]
      }
      return []
    })
}
