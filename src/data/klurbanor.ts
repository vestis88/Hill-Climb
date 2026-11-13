import type { LevelGeom, Pt } from '../sim/level'

/**
 * Klurbanor (puzzle tracks): hand-made levels where the route matters more than top speed.
 * Pick up every gem, then touch the goal flag; the time counts. Speed decides the route:
 * too fast and a loop or a kicker throws you onto the wrong path (or into a pit); too slow and
 * a gap or a climb stops you. Each level is proven to be completable by a scripted driver in
 * tests/klurbanor.test.ts (its `plan`).
 *
 * Coordinates are metres, y up. Solids are closed polygons; the helpers below build them.
 */
export interface PuzzleLevel {
  id: string
  name: string
  /** One line for the level list. */
  hint: string
  geom: LevelGeom
  /** The ground under the start (the vehicle starts just above it). */
  start: { x: number; y: number }
  gems: { x: number; y: number }[]
  goal: { x: number; y: number }
  /** Look: an existing map's theme. */
  theme: string
  /**
   * The scripted driver's route (tests): in order, drive towards `x` at `speed` m/s (negative
   * to reverse) until the vehicle passes it; `air` keeps the nose at that angle when airborne;
   * `pump` rocks back and forth (gas going forwards, brake to roll back) for up to that many
   * seconds while trying to get past x.
   */
  plan: { x: number; speed: number; air?: number; pump?: number }[]
}

/** A surface from left to right, filled down to `bottom`. */
export function ground(surface: Pt[], bottom: number): Pt[] {
  return [...surface, [surface[surface.length - 1][0], bottom], [surface[0][0], bottom]]
}

/** A surface from left to right hanging down from `top` (a ceiling). */
export function roof(surface: Pt[], top: number): Pt[] {
  return [[surface[0][0], top], [surface[surface.length - 1][0], top], ...[...surface].reverse()]
}

/** Points along an arc, angles in degrees (counter-clockwise). */
export function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 12): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}

/** A smooth ramp from (x0, y0) to (x1, y1) (eased at both ends). */
export function ramp(x0: number, y0: number, x1: number, y1: number, steps = 10): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const e = t * t * (3 - 2 * t)
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * e])
  }
  return out
}

/** A kicker: flat, then curving up to a lip at height h over `len` metres. */
export function kicker(x0: number, y0: number, len: number, h: number, steps = 8): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    out.push([x0 + len * t, y0 + h * t * t])
  }
  return out
}

const WALL = 30

/**
 * 1 · Två vägar. A kicker at the start: hit it fast and you fly onto the high road, where a
 * loop and a ramp shoot you down into the pit. Roll over it gently and you drop to the low
 * road, under the overhang, where the gems are; then you need speed to jump the pit to the goal.
 */
const tvaVagar: PuzzleLevel = {
  id: 'k1',
  name: 'Två vägar',
  hint: 'Fort eller försiktigt? Bara en väg leder till målet.',
  theme: 'meadow',
  geom: {
    bottom: -30,
    polygons: [
      // Start plateau with a wall behind, a kicker at its end, then a slope down to the low road.
      ground([[-14, WALL], [-12, WALL], [-12, 0], [36, 0], ...kicker(36, 0, 6, 0.8).slice(1), [42.2, -0.6], ...ramp(42.2, -0.6, 60, -8).slice(1), [110, -8], ...kicker(110, -8, 6, 1.1).slice(1)], -40),
      // The high road: a slab over the low road, a loop on it and a ramp off its end.
      [[54, 0], [96, 0], ...kicker(100, 0, 6, 1.4), [106, -2.5], [54, -2.5]],
      // Beyond the pit: the low road again, the goal and an end wall.
      ground([[130, -8], [162, -8], [162, WALL], [166, WALL]], -40),
    ],
    loops: [{ cx: 92, cy: 3.4, r: 3.4 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 72, y: -7 }, { x: 86, y: -7 }, { x: 100, y: -7 }],
  goal: { x: 156, y: -7 },
  plan: [{ x: 30, speed: 4 }, { x: 64, speed: 5 }, { x: 140, speed: 15 }, { x: 156, speed: 4 }],
}

/** Points along y = f(x) from x0 to x1. */
function curve(x0: number, x1: number, f: (x: number) => number, step = 0.5): Pt[] {
  const out: Pt[] = []
  for (let x = x0; x < x1 - 1e-6; x += step) out.push([x, f(x)])
  out.push([x1, f(x1)])
  return out
}

/**
 * 2 · Lagom. Down a long slope to a cliff edge; the goal is on a narrow pillar just below it.
 * Come off the edge at just the right speed: too slow and you drop into the gap before the
 * pillar, too fast and you sail past it into the canyon.
 */
const stopp: PuzzleLevel = {
  id: 'k2',
  name: 'Lagom',
  hint: 'Lagom fart över kanten, varken för fort eller för sakta.',
  theme: 'canyon',
  geom: {
    bottom: -30,
    polygons: [
      ground([[-14, WALL], [-12, WALL], [-12, 6], [10, 6], ...ramp(10, 6, 40, 0).slice(1), [62, 0]], -40),
      [[66.5, -4], [74, -4], [74, -40], [66.5, -40]],
      ground([[82, WALL], [86, WALL]], -40),
    ],
  },
  start: { x: 0, y: 6 },
  gems: [{ x: 26, y: 4 }, { x: 50, y: 1 }, { x: 60.5, y: 1 }],
  goal: { x: 71, y: -3 },
  plan: [{ x: 38, speed: 9 }, { x: 64, speed: 7 }, { x: 74, speed: 1 }],
}

/** The tunnel floor of level 3: rollers 0.45 m high every 4.5 m. */
const tunnelFloor = (x: number) => (x < 20 || x > 92.5 ? 0 : 0.45 * Math.sin((Math.PI * (x - 20)) / 4.5) ** 2)

/**
 * 3 · Lågt i tak. A tunnel full of rollers with the roof just above your helmet: go fast and
 * you bounce your head into it. Then you need speed again for the hill up to the goal.
 */
const lagtITak: PuzzleLevel = {
  id: 'k3',
  name: 'Lågt i tak',
  hint: 'Akta huvudet i tunneln. Sen behövs fart uppför.',
  theme: 'woods',
  geom: {
    bottom: -30,
    polygons: [
      ground([[-14, WALL], [-12, WALL], [-12, 0], ...curve(0, 96, tunnelFloor), ...ramp(96, 0, 124, 8).slice(1), [150, 8], [150, WALL], [154, WALL]], -20),
      roof(curve(22, 92, (x) => tunnelFloor(x) + 2.75), 14),
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 38, y: 0.9 }, { x: 56, y: 0.9 }, { x: 74, y: 0.9 }],
  goal: { x: 140, y: 9 },
  plan: [{ x: 18, speed: 3 }, { x: 88, speed: 3.5 }, { x: 124, speed: 13 }, { x: 140, speed: 5 }],
}

/**
 * 4 · Gungan. You start at the bottom of a deep valley. The gem is high up the slope behind
 * you and the goal up on a ledge beyond a wall too steep to drive straight up: rock back and
 * forth (gas forwards, let it roll back) to swing higher each time, then over the lip.
 */
const gungan: PuzzleLevel = {
  id: 'k4',
  name: 'Gungan',
  hint: 'För brant att köra rakt upp. Gunga fram och tillbaka!',
  theme: 'frost',
  geom: {
    bottom: -30,
    polygons: [
      ground([[-24, WALL], [-22, WALL], [-22, 8], ...ramp(-22, 8, -4, 0).slice(1), [4, 0], ...ramp(4, 0, 24, -9).slice(1), ...ramp(24, -9, 38, 2.5, 16).slice(1), [62, 2.5], [62, WALL], [66, WALL]], -40),
    ],
  },
  start: { x: 24, y: -9 },
  gems: [{ x: -12, y: 4.6 }],
  goal: { x: 55, y: 3.5 },
  plan: [{ x: -11, speed: -3, pump: 40 }, { x: 60, speed: 16, pump: 40 }, { x: 55, speed: 4 }],
}

/**
 * 5 · Loopen eller gropen. The fork from Två vägar again, but now you need both roads: the
 * gems are down in the cave (take it slowly), the cave climbs back up to the high road, and a
 * gem waits at the top of the loop. After the loop: a jump over the pit to the goal island.
 */
const loopenEllerGropen: PuzzleLevel = {
  id: 'k5',
  name: 'Loopen eller gropen',
  hint: 'Grottan först, sen loopen, sen hoppet. I rätt fart.',
  theme: 'stunt',
  geom: {
    bottom: -30,
    polygons: [
      // Start plateau, kicker, slope down into the cave, the cave floor, and the climb back up.
      ground([[-14, WALL], [-12, WALL], [-12, 0], [32, 0], ...kicker(32, 0, 6, 0.8).slice(1), [38.2, -0.6], ...ramp(38.2, -0.6, 54, -8).slice(1), [92, -8], ...ramp(92, -8, 118, 0).slice(1), [150, 0], ...kicker(150, 0, 7, 1.3).slice(1)], -40),
      // The cave roof (the high road over it).
      [[50, 0], [96, 0], [96, -2.6], [50, -2.6]],
      // The goal island beyond the pit.
      ground([[166, 0], [184, 0], [184, WALL], [188, WALL]], -40),
    ],
    loops: [{ cx: 134, cy: 3.4, r: 3.4 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 66, y: -7 }, { x: 82, y: -7 }, { x: 134, y: 6 }],
  goal: { x: 176, y: 1 },
  plan: [{ x: 26, speed: 4 }, { x: 58, speed: 5 }, { x: 160, speed: 15 }, { x: 176, speed: 4 }],
}

const LEVELS_RAW: PuzzleLevel[] = [tvaVagar, stopp, lagtITak, gungan, loopenEllerGropen]

export const LEVELS = LEVELS_RAW

export const puzzleLevel = (id: string) => LEVELS.find((l) => l.id === id)
