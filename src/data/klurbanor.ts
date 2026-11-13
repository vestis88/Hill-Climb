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
  /** The goal only counts with a wheel on the ground (landing on it, not flying past). */
  goalOnGround?: boolean
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

/** A pillar from x0 to x1 with its top at y, reaching down to `bottom`; optionally a kicker at its right end. */
export function pillar(x0: number, x1: number, y: number, bottom = -40, kick?: { len: number; h: number }): Pt[] {
  const top: Pt[] = kick ? [[x0, y], ...kicker(x1 - kick.len, y, kick.len, kick.h)] : [[x0, y], [x1, y]]
  const last = top[top.length - 1]
  return [...top, [last[0], bottom], [x0, bottom]]
}

/** A floating block (a ledge or a ceiling piece) from (x0, y0) to (x1, y1). */
export function block(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

/** A pointed rock rising from below to a tip at `top` (nothing can rest on it). */
export function spike(x0: number, x1: number, top: number, bottom = -40): Pt[] {
  return [[x0, bottom], [x1, bottom], [x1, top - 0.6], [(x0 + x1) / 2, top], [x0, top - 0.6]]
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

/**
 * 6 · Trappan. Stepping stones over a bottomless gorge: short pillars at different heights,
 * each with its own gap, and only a few metres to change speed between jumps. Every jump has a
 * window of a m/s or two (the first one 9 to 10 m/s, about 33 to 36 km/h on the HUD): too slow
 * falls short, too fast flies past the next stone or leaves no room on it for the next jump.
 */
const trappan: PuzzleLevel = {
  id: 'k6',
  name: 'Trappan',
  hint: 'Små stenar, olika långt mellan. Varje hopp kräver sin egen fart.',
  theme: 'canyon',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], ...pillar(-12, 20, 0, -40, { len: 4, h: 1.2 }).slice(0, -1), [-14, -40]],
      pillar(27, 34, 0.5, -40, { len: 3, h: 1 }),
      pillar(41, 49, -2, -40, { len: 3, h: 1 }),
      pillar(55, 61, -2.8),
      pillar(64.5, 71.5, -5, -40, { len: 3, h: 1.2 }),
      ground([[77.5, -5], [97, -5], [97, WALL], [101, WALL]], -40),
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 31, y: 1.5 }, { x: 45, y: -1 }, { x: 58, y: -1.8 }, { x: 68, y: -4 }],
  goal: { x: 89, y: -4 },
  plan: [{ x: 20, speed: 9.5 }, { x: 34, speed: 11 }, { x: 49, speed: 11 }, { x: 61, speed: 11 }, { x: 71.5, speed: 12 }, { x: 89, speed: 8 }],
}

/**
 * 7 · Fönstret. A long jump under a hanging rock: it needs speed, but jump too high and your
 * helmet hits the rock. Then a careful drop into a low cave for a gem, out over a pit, and an
 * upward jump through a narrow window between two rocks, with a gem hanging right in it.
 */
const fonstret: PuzzleLevel = {
  id: 'k7',
  name: 'Fönstret',
  hint: 'Hoppa lågt och fort under klippan. Sen genom fönstret, mitt i.',
  theme: 'woods',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], ...pillar(-12, 30, 0, -40, { len: 4, h: 0.9 }).slice(0, -1), [-14, -40]],
      // The hanging rock over the first pit.
      block(34.5, 4.1, 39.5, 14),
      // Landing shelf, its roof over the cave below, then the cave floor with a kicker out.
      pillar(40, 58, 0, -2.6),
      [[58, -6], ...kicker(72, -6, 4, 1.4), [76, -40], [50, -40], [50, -6]],
      // The far side: a shelf, then the window: a rock above and a rock below the gap.
      pillar(83, 101, -5.5, -40, { len: 4, h: 1.3 }),
      block(103.5, 1.2, 108, 14),
      block(103.5, -12, 106.5, -5.2),
      ground([[110, -3.8], [134, -3.8], [134, WALL], [138, WALL]], -40),
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 64, y: -5 }, { x: 105.5, y: -1.8 }],
  goal: { x: 126, y: -2.8 },
  plan: [{ x: 30, speed: 12 }, { x: 57.5, speed: 2 }, { x: 76, speed: 12 }, { x: 101, speed: 13 }, { x: 126, speed: 4 }],
}

/**
 * 8 · Nålsögat. Three kickers over three gaps. Over the first two, a gem hangs in a narrow eye
 * between a rock above and a rock below, placed on the measured arc of one speed: too fast and
 * your helmet hits the top rock, too slow and you hit the bottom one. The last jump has to land
 * on a small island with the goal flag.
 */
const nalsogat: PuzzleLevel = {
  id: 'k8',
  name: 'Nålsögat',
  hint: 'Två smala nålsögon i luften och en liten ö att landa på. Rätt fart, varje gång.',
  theme: 'crater',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], ...pillar(-12, 25, 0, -40, { len: 4, h: 1.3 }).slice(0, -1), [-14, -40]],
      // Eye 1, over the first gap: for 11 m/s (the arc passes 3.3 m up here).
      block(32.6, 4.85, 33.4, 14),
      spike(32.6, 33.4, 2.2),
      pillar(36, 62, -2, -40, { len: 3, h: 1.8 }),
      // Eye 2: for 10 m/s off the steep kicker (2.6 m up here; it changes fast with speed).
      block(65.6, 4.35, 66.4, 14),
      spike(65.6, 66.4, 1.45),
      pillar(67, 96, -1, -40, { len: 5, h: 1.0 }),
      // The goal island: land on it.
      pillar(108.5, 112.5, -4),
      ground([[128, WALL], [132, WALL]], -40),
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 33, y: 3.3 }, { x: 66, y: 2.65 }, { x: 80, y: 0 }],
  goal: { x: 110.5, y: -3 },
  goalOnGround: true,
  plan: [{ x: 25, speed: 10.5 }, { x: 62, speed: 10.25 }, { x: 96, speed: 11 }, { x: 110.5, speed: 1 }],
}

/**
 * 9 · Avsatserna. Up a cliff in three jumps, each onto a ledge with a low roof hanging over its
 * front: the arc has to slip in under the roof's edge and still clear the ledge's lip. Each
 * ledge is short, so you land, set your speed and jump again almost at once.
 */
const avsatserna: PuzzleLevel = {
  id: 'k9',
  name: 'Avsatserna',
  hint: 'Uppför i tre hopp, in under taken. För högt och du slår i huvudet.',
  theme: 'frost',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], ...pillar(-12, 25, 0, -40, { len: 4, h: 1.6 }).slice(0, -1), [-14, -40]],
      // Ledge 1, its roof over the landing.
      pillar(31, 42, 2.5, -40, { len: 3, h: 1.4 }),
      block(30, 5.6, 36, 8),
      // Ledge 2.
      pillar(47, 58, 4.8, -40, { len: 3, h: 1.4 }),
      block(46, 7.9, 52, 10),
      // The top, with the goal.
      ground([[63.5, 7], [92, 7], [92, WALL], [96, WALL]], -40),
      block(62.5, 10.1, 68.5, 12.5),
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 37, y: 3.5 }, { x: 53, y: 5.8 }, { x: 78, y: 8 }],
  goal: { x: 86, y: 8 },
  plan: [{ x: 25, speed: 10 }, { x: 42, speed: 12 }, { x: 58, speed: 12 }, { x: 86, speed: 6 }],
}

/** Level 10's long floor: flat, with rollers under the tunnel roof (x 94 to 112). */
const masterFloor = (x: number) => -4 + (x > 94 && x < 112.5 ? 0.45 * Math.sin((Math.PI * (x - 94)) / 4.5) ** 2 : 0)

/**
 * 10 · Mästarprovet. Everything at once: the stepping stones, down to a loop with a gem at its
 * top, a tunnel of rollers where you must ease off, then out over a kicker through a needle's
 * eye (a gem between two rocks) and down onto the goal island.
 */
const mastarprovet: PuzzleLevel = {
  id: 'k10',
  name: 'Mästarprovet',
  hint: 'Allt på en gång: stenar, loop, tunnel, nålsöga och ön.',
  theme: 'stunt',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], ...pillar(-12, 20, 0, -40, { len: 4, h: 1.2 }).slice(0, -1), [-14, -40]],
      pillar(27, 34, 0.5, -40, { len: 3, h: 1 }),
      pillar(41, 49, -2, -40, { len: 3, h: 1 }),
      // The long floor: landing, the loop, the tunnel and a kicker at its end.
      [[55, -4], ...curve(55, 124, masterFloor).slice(1), ...kicker(124, -4, 4, 1.2).slice(1), [128, -40], [55, -40]],
      roof(curve(94, 112.5, (x) => masterFloor(x) + 2.75), 4),
      // The needle's eye after the kicker, then the goal island.
      block(135.6, -0.27, 136.4, 14),
      spike(135.6, 136.4, -3.07),
      pillar(139, 143.3, -6.5),
      ground([[162, WALL], [166, WALL]], -40),
    ],
    loops: [{ cx: 78, cy: -0.6, r: 3.4 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 78, y: 1.9 }, { x: 103, y: -3.1 }, { x: 136, y: -1.9 }],
  goal: { x: 141.3, y: -5.5 },
  goalOnGround: true,
  plan: [{ x: 20, speed: 9.5 }, { x: 34, speed: 11 }, { x: 49, speed: 11 }, { x: 88, speed: 14 }, { x: 113, speed: 3.5 }, { x: 128, speed: 10 }, { x: 141.3, speed: 1 }],
}

const LEVELS_RAW: PuzzleLevel[] = [tvaVagar, stopp, lagtITak, gungan, loopenEllerGropen, trappan, fonstret, nalsogat, avsatserna, mastarprovet]

export const LEVELS = LEVELS_RAW

export const puzzleLevel = (id: string) => LEVELS.find((l) => l.id === id)
