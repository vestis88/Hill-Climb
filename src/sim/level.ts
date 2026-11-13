/**
 * Klurbanor (puzzle tracks): finite, hand-made levels built from solid polygons instead of a
 * height function, so they can have ledges, overhangs, ceilings and tunnels, and more than one
 * route. Loops are the same physics loops as Stuntbanan's (sim/world.ts).
 */
export type Pt = [number, number]

export interface LevelGeom {
  /** Solid shapes (closed polygons, any winding): the vehicle drives on their outside. */
  polygons: Pt[][]
  /** Physics loops: a ring whose bottom sits flush on the ground; entered from the left. */
  loops?: { cx: number; cy: number; r: number }[]
  /** Seesaws: a plank `length` long on a pivot at (x, y); it starts tipped down on its left end. */
  seesaws?: { x: number; y: number; length: number; density?: number }[]
  /** Below this the vehicle has fallen out of the level (the run ends). */
  bottom: number
}

interface Seg {
  ax: number
  ay: number
  bx: number
  by: number
}

const cache = new WeakMap<LevelGeom, Seg[]>()
function segments(level: LevelGeom): Seg[] {
  let segs = cache.get(level)
  if (!segs) {
    segs = []
    for (const poly of level.polygons) {
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
export function circleHits(level: LevelGeom, x: number, y: number, r: number): boolean {
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
  return level.polygons.some((p) => inside(p, x, y))
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
  for (const p of level.polygons) {
    for (const [x, y] of p) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  return { minX, maxX, minY, maxY }
}
