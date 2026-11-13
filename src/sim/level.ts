/**
 * Klurbanor (puzzle tracks): finite, hand-made levels built from solid polygons instead of a
 * height function, so they can have ledges, overhangs, ceilings and tunnels, and more than one
 * route. Loops are the same physics loops as Stuntbanan's (sim/world.ts).
 */
export type Pt = [number, number]

export interface LevelGeom {
  /** Solid shapes (closed polygons, any winding): the vehicle drives on their outside. */
  polygons: Pt[][]
  /** Solid shapes made of ice: no grip at all, so you can neither speed up nor brake on them. */
  ice?: Pt[][]
  /** Physics loops: a ring whose bottom sits flush on the ground; entered from the left. */
  loops?: { cx: number; cy: number; r: number }[]
  /** Seesaws: a plank `length` long on a pivot at (x, y); it starts tipped down on its left end. */
  seesaws?: { x: number; y: number; length: number; density?: number }[]
  /**
   * Special strips laid on a surface from (x0, y) to (x1, y1 ?? y):
   * - bounce: a trampoline; touching it throws the vehicle up at `power` m/s.
   * - boost: speeds the vehicle up towards `power` m/s (negative pushes left).
   * - ice: almost no grip.
   */
  pads?: Pad[]
  /** Doors: solid until the gem with index `key` is taken (then they vanish). */
  doors?: { poly: Pt[]; key: number }[]
  /** Crumbling planks from x0 to x1 with their top at y: they fall `delay` seconds after a wheel first touches them. */
  crumbles?: { x0: number; x1: number; y: number; delay: number }[]
  /** Below this the vehicle has fallen out of the level (the run ends). */
  bottom: number
}

export interface Pad {
  kind: 'bounce' | 'boost' | 'ice'
  x0: number
  x1: number
  y: number
  y1?: number
  power?: number
}

/** A pad's outline: a thin strip just above the surface, tapered at both ends. */
export function padPolygon(p: Pad): Pt[] {
  const y1 = p.y1 ?? p.y
  const k = (y1 - p.y) / (p.x1 - p.x0)
  const at = (x: number) => p.y + k * (x - p.x0)
  return [[p.x0 - 0.3, at(p.x0 - 0.3) - 0.02], [p.x0, at(p.x0) + 0.08], [p.x1, at(p.x1) + 0.08], [p.x1 + 0.3, at(p.x1 + 0.3) - 0.02], [p.x1 + 0.3, at(p.x1 + 0.3) - 0.5], [p.x0 - 0.3, at(p.x0 - 0.3) - 0.5]]
}

/** A crumbling plank's outline at rest. */
export function crumblePolygon(c: { x0: number; x1: number; y: number }): Pt[] {
  return [[c.x0, c.y], [c.x1, c.y], [c.x1, c.y - 0.45], [c.x0, c.y - 0.45]]
}

interface Seg {
  ax: number
  ay: number
  bx: number
  by: number
}

/** Every solid of a level: rock and ice. */
export const solids = (level: LevelGeom): Pt[][] => (level.ice ? [...level.polygons, ...level.ice] : level.polygons)

const cache = new WeakMap<LevelGeom, Seg[]>()
function segments(level: LevelGeom): Seg[] {
  let segs = cache.get(level)
  if (!segs) {
    segs = []
    for (const poly of solids(level)) {
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i]
        const [bx, by] = poly[(i + 1) % poly.length]
        segs.push({ ax, ay, bx, by })
      }
    }
    cache.set(level, segs)
  }
  return segs
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** True when a circle (the driver's head) touches or is inside any solid. */
export function circleHits(level: LevelGeom, x: number, y: number, r: number, extra: Pt[][] = []): boolean {
  if (extra.length && extra.some((p) => polyHits(p, x, y, r))) return true
  const r2 = r * r
  for (const s of segments(level)) {
    // Quick reject by bounding box.
    if (x + r < Math.min(s.ax, s.bx) || x - r > Math.max(s.ax, s.bx) || y + r < Math.min(s.ay, s.by) || y - r > Math.max(s.ay, s.by)) continue
    const dx = s.bx - s.ax
    const dy = s.by - s.ay
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / len2))
    const px = s.ax + dx * t - x
    const py = s.ay + dy * t - y
    if (px * px + py * py < r2) return true
  }
  return solids(level).some((p) => inside(p, x, y))
}

/** True when a circle touches or is inside one polygon. */
export function polyHits(poly: Pt[], x: number, y: number, r: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % poly.length]
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    if ((ax + dx * t - x) ** 2 + (ay + dy * t - y) ** 2 < r * r) return true
  }
  return inside(poly, x, y)
}

/**
 * The top of the ground under a point: the highest solid surface at x that is not above y
 * (with a little slack), or the level's bottom. Used for the shadow and for "how steep is it here".
 */
export function groundBelow(level: LevelGeom, x: number, y: number): number {
  let best = level.bottom
  for (const s of segments(level)) {
    if (x < Math.min(s.ax, s.bx) || x > Math.max(s.ax, s.bx) || s.ax === s.bx) continue
    const sy = s.ay + ((x - s.ax) / (s.bx - s.ax)) * (s.by - s.ay)
    if (sy <= y + 0.3 && sy > best) best = sy
  }
  return best
}

/** The level's bounding box. */
export function levelBounds(level: LevelGeom): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of solids(level)) {
    for (const [x, y] of p) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  return { minX, maxX, minY, maxY }
}
