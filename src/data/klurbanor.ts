import type { LevelGeom, Pt } from '../sim/level'

/**
 * Klurbanor (puzzle tracks): hand-made levels where the route matters more than top speed.
 * (Levels 13 on have ids n13... : k13 to k42 were earlier generated levels, so old records and
 * "done" marks for those ids do not carry over.)
 * From 13 on they use special pieces too (sim/level.ts): trampolines, speed strips, ice, doors
 * opened by a key gem, and planks that crumble after you touch them.
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
  /** The goal only counts once you have stopped by it (under 1 m/s). */
  goalStill?: boolean
  /** Look: an existing map's theme. */
  theme: string
  /**
   * The scripted driver's route (tests): in order, drive towards `x` at `speed` m/s (negative
   * to reverse) until the vehicle passes it; `air` keeps the nose at that angle when airborne;
   * `pump` rocks back and forth (gas going forwards, brake to roll back) for up to that many
   * seconds while trying to get past x; `coast` touches neither pedal (on the ground); `below`
   * also ends the step once the vehicle has dropped below that height; `wait` holds the step
   * (coasting, once at x) until that many seconds into the run (for a moving platform); `flip`
   * swaps the pedals' direction (driving upside down on a ceiling).
   */
  plan: { x: number; speed: number; air?: number; pump?: number; coast?: boolean; below?: number; wait?: number; flip?: boolean }[]
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
      roof(curve(22, 92, (x) => tunnelFloor(x) + 2.6), 14),
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
 * window of a m/s or two (the first one 8.5 to 10.5 m/s, about 31 to 38 km/h on the HUD): too slow
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
  plan: [{ x: 25, speed: 11 }, { x: 62, speed: 10.25 }, { x: 96, speed: 11 }, { x: 110.5, speed: 1 }],
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
  plan: [{ x: 25, speed: 10.5 }, { x: 42, speed: 9.5 }, { x: 58, speed: 9.5 }, { x: 86, speed: 11.5 }],
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

/**
 * 11 · Gungbrädan. Three seesaws bridge bottomless pits, with only a short ledge between the
 * last two. Drive on gently and the plank tips you across; rush it and you are thrown off its
 * high end before it tips, into the low roof over it. A gem sits above each pivot.
 */
const gungbradan: PuzzleLevel = {
  id: 'k11',
  name: 'Gungbrädan',
  hint: 'Låt brädan tippa, men ha fart nog att hoppa av den.',
  theme: 'woods',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], ...pillar(-12, 33.4, 0).slice(0, -1), [-14, -40]],
      block(36.8, -40, 37.2, 0.2),
      // Each plank tips onto nothing: the next ledge is a little gap away and lower.
      pillar(43, 53.4, -0.8),
      block(56.8, -40, 57.2, -0.6),
      pillar(63, 66.4, -1.6),
      block(69.8, -40, 70.2, -1.4),
      ground([[76, -2.4], [100, -2.4], [100, WALL], [104, WALL]], -40),
      // Low roofs over the far half of each plank: ride up it before it tips and your helmet
      // hits the roof.
      block(37.6, 4.1, 42, 8),
      block(57.6, 3.3, 62, 8),
      block(70.6, 2.5, 75, 8),
    ],
    seesaws: [{ x: 37, y: 1.1, length: 8, density: 15 }, { x: 57, y: 0.3, length: 8, density: 15 }, { x: 70, y: -0.5, length: 8, density: 15 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 37, y: 2.3 }, { x: 57, y: 1.5 }, { x: 70, y: 0.7 }],
  goal: { x: 92, y: -1.4 },
  plan: [{ x: 30, speed: 6 }, { x: 92, speed: 6 }],
}

/**
 * 12 · Dubbelloopen. Two loops back to back (a gem at the top of each), then a kicker over a
 * pit onto a 4 m shelf at the edge of a cliff, with the goal flag on it: it only counts once
 * you have landed, so keep all your speed through the loops for the jump.
 */
const dubbelloopen: PuzzleLevel = {
  id: 'k12',
  name: 'Dubbelloopen',
  hint: 'Två loopar i rad, sen hoppet ner på en liten hylla vid stupet.',
  theme: 'dunes',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [70, 0], ...kicker(70, 0, 4, 1.2).slice(1), [74, -40], [-14, -40]],
      pillar(86, 90, -1),
      ground([[110, WALL], [114, WALL]], -40),
    ],
    loops: [{ cx: 36, cy: 3.4, r: 3.4 }, { cx: 54, cy: 3.4, r: 3.4 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 36, y: 5.9 }, { x: 54, y: 5.9 }, { x: 87.5, y: 0 }],
  goal: { x: 89, y: 0 },
  goalOnGround: true,
  plan: [{ x: 70, speed: 14 }, { x: 74, speed: 11 }, { x: 89, speed: 0.5 }],
}

/**
 * 13 · Studsmattan. Trampolines throw you straight up; how far you go sideways is the speed you
 * bring. The first lifts you onto a ledge. The second is a small one down a deep pit:
 * come off the ledge too slowly and you drop past it, too fast and you fly over it, and
 * you need enough to clear the far wall after the bounce. The last one sends you up to the goal on a high perch.
 */
const studsmattan: PuzzleLevel = {
  id: 'n13',
  name: 'Studsmattan',
  hint: 'Studsmattan kastar dig rakt upp. Farten du har med dig avgör var du landar.',
  theme: 'meadow',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -6], [30, -6], [30, 4], [50, 4], [50, -40], [-14, -40]],
      // Down in the second pit: the trampoline, with nothing either side of it.
      pillar(56, 62, -8),
      [[66, -40], [66, 2], [99, 2], [99, WALL], [103, WALL], [103, -40]],
      // The perch with the goal, high over the last trampoline.
      block(92, 11, 96, 12),
    ],
    pads: [
      { kind: 'bounce', x0: 21, x1: 29, y: -6, power: 16 },
      { kind: 'bounce', x0: 56.2, x1: 61.8, y: -8, power: 16 },
      { kind: 'bounce', x0: 84, x1: 88, y: 2, power: 16 },
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 25, y: 5 }, { x: 65.5, y: 5 }, { x: 87, y: 13 }],
  goal: { x: 94, y: 13 },
  goalOnGround: true,
  plan: [{ x: 20, speed: 4 }, { x: 30, speed: 4 }, { x: 50, speed: 5.5 }, { x: 89, speed: 4.75 }, { x: 94, speed: 0.5 }],
}

/**
 * 14 · Nyckeln. Doors open when you take the gem of their colour. The yellow key is behind you:
 * back up the slope onto the ledge, gently, or you fly off its far end. Through the yellow door,
 * a trampoline lifts you onto a shelf with the blue key; back off the shelf and drive under it
 * to the blue door.
 */
const nyckeln: PuzzleLevel = {
  id: 'n14',
  name: 'Nyckeln',
  hint: 'Dörrarna öppnas av stenen i samma färg. Ibland ligger den bakom dig.',
  theme: 'woods',
  geom: {
    bottom: -30,
    polygons: [
      // The ledge behind the start (a ramp up to it), with a pit beyond it.
      [[-30, -40], [-30, 4], [-22, 4], ...ramp(-22, 4, -8, 0).slice(1), [50, 0], [50, -40]],
      [[-44, WALL], [-40, WALL], [-40, -40], [-44, -40]],
      // The tunnel with the yellow door, then the shelf, then the wall with the blue door.
      block(16, 3, 40, WALL),
      block(64, 4, 80, 6),
      [[50, -40], [50, 0], [110, 0], [110, WALL], [114, WALL], [114, -40]],
      block(80, 2.8, 90, WALL),
    ],
    pads: [{ kind: 'bounce', x0: 50, x1: 55, y: 0, power: 15 }],
    doors: [{ poly: block(27, 0, 28, 3), key: 0 }, { poly: block(84, 0, 85, 2.8), key: 1 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: -26, y: 5 }, { x: 72, y: 7 }, { x: 54, y: 12 }],
  goal: { x: 100, y: 1 },
  plan: [{ x: -26, speed: -3 }, { x: 45, speed: 7 }, { x: 73, speed: 7 }, { x: 61, speed: -3 }, { x: 100, speed: 5 }],
}

/**
 * 15 · Isbanan. On ice there is no grip: you cannot speed up or brake, so the speed you take
 * onto it is the speed you have. Off the edge and down an icy valley, then up and over a pit:
 * too slow and you fall short, too fast and you fly off the edge into the rock hanging over the
 * slope. Choose the speed before the ice. Then, on the grit, the speed for an
 * icy hump with the goal on a little patch of gravel at its very top, where you must stop:
 * too slow and you slide back, too fast and you slide over it and down the far side.
 */
const isbanan: PuzzleLevel = {
  id: 'n15',
  name: 'Isbanan',
  hint: 'Ingen fart att vinna eller bromsa på isen. Bestäm farten innan.',
  theme: 'frost',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 4], [20, 4], [20, -40], [-14, -40]],
      // The landing: a stretch of grit before the ice hump.
      [[73, -40], [73, -4], [94, -4], [94, -40]],
      // The gravel patch on top of the hump, with the goal.
      [[108, -40], [108, 1], [112, 1], [112, -40]],
      // The rock over the jump.
      block(29, 3, 33, 14),
    ],
    ice: [
      [[20, 4], ...ramp(20, 4, 40, -6).slice(1), [48, -6], [52, -5.6], [67, -1.5], [67, -40], [20, -40]],
      [[94, -4], ...ramp(94, -4, 108, 1).slice(1), [108, -40], [94, -40]],
      [[112, 1], ...ramp(112, 1, 126, -8).slice(1), [126, -40], [112, -40]],
    ],
  },
  start: { x: 0, y: 4 },
  gems: [{ x: 45, y: -5 }, { x: 70, y: 0 }, { x: 101, y: -0.5 }],
  goal: { x: 110, y: 2 },
  goalStill: true,
  plan: [{ x: 20, speed: 8 }, { x: 73, speed: 6, coast: true }, { x: 94, speed: 11 }, { x: 108, speed: 9, coast: true }, { x: 110, speed: 0 }],
}

/** Crumbling planks side by side from x0, each `w` long. */
function planks(x0: number, n: number, y: number, delay: number, w = 4): { x0: number; x1: number; y: number; delay: number }[] {
  return Array.from({ length: n }, (_, i) => ({ x0: x0 + i * w, x1: x0 + (i + 1) * w, y, delay }))
}

/**
 * 16 · Rasbron. Wooden planks fall a moment after you first touch them. Across the first bridge
 * without stopping. The second bridge holds a little longer: the gem is on the floor beneath
 * it, so stop on it and ride a plank down. Down there a trampoline throws you back up, and the
 * last bridge falls fast: full speed all the way to the goal.
 */
const rasbron: PuzzleLevel = {
  id: 'n16',
  name: 'Rasbron',
  hint: 'Plankorna rasar strax efter att du kört på dem. Ibland vill du att de rasar.',
  theme: 'canyon',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -40], [-14, -40]],
      // Between the first and second bridge; under the second, the lower floor.
      [[44, -40], [44, 0], [60, 0], [60, -8], [101, -8], [101, 0], [114, 0], [114, -40]],
      // Past the second bridge, on top: a short ledge, and a pit before the trampoline's ledge.
      block(80, -2, 88, 0),
      // After the last bridge: the goal and an end wall.
      ground([[142, 0], [164, 0], [164, WALL], [168, WALL]], -40),
    ],
    crumbles: [...planks(20, 6, 0, 0.45), ...planks(60, 5, 0, 1.2), ...planks(114, 7, 0, 0.3)],
    pads: [{ kind: 'bounce', x0: 94, x1: 99, y: -8, power: 15 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 32, y: 1.5 }, { x: 72, y: -7 }, { x: 128, y: 1.5 }],
  goal: { x: 150, y: 1 },
  plan: [{ x: 20, speed: 10 }, { x: 44, speed: 10 }, { x: 64, speed: 4 }, { x: 999, speed: 0, below: -5 }, { x: 110, speed: 5 }, { x: 150, speed: 14 }],
}

/**
 * 17 · Turbo. Yellow strips throw you up to their speed. The first one is far too fast for the
 * needle's eye over the canyon: brake down to the right speed on the short runway after it.
 * The second gets you round the big loop. The last lies just before a cliff with the goal at
 * its edge: hit it and you can never stop in time, so hop over it off the little kicker and stop
 * by the flag.
 */
const turbo: PuzzleLevel = {
  id: 'n17',
  name: 'Turbo',
  hint: 'Gula remsor ger fart. För mycket fart är också ett problem.',
  theme: 'stunt',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [30, 0], ...kicker(30, 0, 4, 1.2).slice(1), [34, -40], [-14, -40]],
      // The needle's eye over the canyon.
      block(45.6, 6.1, 46.4, 14),
      spike(45.6, 46.4, 3.45),
      // The far side: the loop, then the hop over the last strip, and the cliff.
      [[58, -40], [58, -4], [144, -4], ...kicker(144, -4, 4, 0.9).slice(1), [148, -3.1], [148, -4], [170, -4], [170, -40]],
    ],
    loops: [{ cx: 120, cy: 1, r: 5 }],
    pads: [
      { kind: 'boost', x0: 10, x1: 18, y: 0, power: 20 },
      { kind: 'boost', x0: 98, x1: 106, y: -4, power: 18 },
      { kind: 'boost', x0: 150, x1: 156, y: -4, power: 22 },
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 46, y: 4.55 }, { x: 120, y: 4.6 }, { x: 160, y: -3 }],
  goal: { x: 165, y: -3 },
  goalStill: true,
  plan: [{ x: 18, speed: 20 }, { x: 34, speed: 16.25 }, { x: 98, speed: 8 }, { x: 130, speed: 20 }, { x: 148, speed: 11 }, { x: 163.8, speed: 3 }, { x: 999, speed: 0 }],
}

/**
 * 18 · Gruvan. The door ahead needs the yellow key, deep in the mine below. Drop through the
 * hole, back all the way through the mine to the key and on to the trampoline at its far end:
 * backwards, it throws you up onto the ledge behind. From there, forwards: off the ledge's
 * kicker onto the mine roof, over the hole this time, and through the door.
 */
const gruvan: PuzzleLevel = {
  id: 'n18',
  name: 'Gruvan',
  hint: 'Nyckeln ligger nere i gruvan. Hitta vägen upp igen.',
  theme: 'canyon',
  geom: {
    bottom: -30,
    polygons: [
      // The ledge at the top left (a kicker at its edge), the mine floor below.
      [[-48, WALL], [-44, WALL], [-44, -2], [-30, -2], ...kicker(-30, -2, 4, 0.8).slice(1), [-26, -40], [-48, -40]],
      [[-26, -40], [-26, -13], [42, -13], [42, -40]],
      // The mine roof you start on, with a kicker over the hole at its end.
      [[-16, -4], [32, -4], ...kicker(32, -4, 4, 0.8).slice(1), [36, -5], [-16, -5]],
      // Past the hole: the tunnel with the door, and the goal.
      [[42, -40], [42, -4], [100, -4], [100, WALL], [104, WALL], [104, -40]],
      block(52, -1, 70, WALL),
    ],
    pads: [{ kind: 'bounce', x0: -24, x1: -19, y: -13, power: 16 }],
    doors: [{ poly: block(60, -4, 61, -1), key: 0 }],
  },
  start: { x: 10, y: -4 },
  gems: [{ x: 20, y: -12 }, { x: -38, y: -1 }, { x: 39, y: -2 }],
  goal: { x: 90, y: -3 },
  plan: [{ x: 37, speed: 3 }, { x: -40, speed: -5 }, { x: 90, speed: 10 }],
}

/**
 * 19 · Raset. Down through two floors of crumbling planks, standing on the one that will carry
 * you down. On the top floor there is nothing beneath the first planks and they fall fast: rush
 * over them and stop further on. On the next floor it is the other way round: only the first
 * planks have a floor beneath them, so creep on and stop at once. At the bottom, the goal is
 * back the way you came.
 */
const raset: PuzzleLevel = {
  id: 'n19',
  name: 'Raset',
  hint: 'Stanna på rätt planka, så tar den dig ner en våning.',
  theme: 'woods',
  geom: {
    bottom: -45,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -60], [-14, -60]],
      // The middle floor, a slab under the top floor's last planks.
      block(36, -9, 56, -8),
      // The bottom floor, under the middle floor and its first plank.
      [[36, -60], [36, -16], [60, -16], [60, -60]],
      [[32, -60], [32, -9], [36, -9], [36, -60]],
      // A wall at the end of the top planks.
      block(44, 0, 47, WALL),
    ],
    crumbles: [...planks(20, 6, 0, 0.45), ...planks(56, 6, -8, 0.5)],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 28, y: 1.5 }, { x: 48, y: -7 }, { x: 57, y: -7 }, { x: 50, y: -15 }],
  goal: { x: 40, y: -15 },
  plan: [{ x: 36, speed: 13 }, { x: 999, speed: 0, below: -4 }, { x: 55, speed: 4 }, { x: 999, speed: 0, below: -12 }, { x: 40, speed: -4 }],
}

/** Level 20's hills: [start x, height] of each; icy up, grit down. */
const HILLS: [number, number][] = [[20, 3], [52, 5.5], [86, 3.5], [118, 6]]
const hillDown = (x: number, h: number) => ramp(x + 14, h, x + 24, 0)
/** Each hill's icy front: curving up like a kicker (in three straight pieces), steepest at the top. */
const hillFace = (x: number, h: number): Pt[] => [[x, 0], [x + 6, 0.25 * h], [x + 9, 0.5625 * h], [x + 12, h]]

/**
 * 20 · Berg-och-dal. Hills with icy fronts: you cannot speed up on the way up, so you must reach
 * each one with the right speed from the grit in the valley before it. Too slow and you slide
 * back down; too fast and you fly off the top into the rock hanging over it. Every hill is a
 * different height.
 */
const bergOchDal: PuzzleLevel = {
  id: 'n20',
  name: 'Berg-och-dal',
  hint: 'Isen uppför ger ingen fart. Ta rätt fart i dalen före varje backe.',
  theme: 'frost',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], ...HILLS.flatMap(([x, h]): Pt[] => [...hillFace(x, h), [x + 14, h], ...hillDown(x, h)]), [164, 0], [164, WALL], [168, WALL], [164, -40], [-14, -40]],
      // A rock over each top.
      ...HILLS.map(([x, h]) => block(x + 11, h + 2.6, x + 19, h + 12)),
    ],
    // Ice up each front.
    pads: HILLS.flatMap(([x, h]) => {
      const f = hillFace(x, h)
      return [0, 1, 2].map((i) => {
        const [x0, y0] = f[i]
        const [x1, y1] = f[i + 1]
        const k = (y1 - y0) / (x1 - x0)
        return { kind: 'ice' as const, x0: x0 + 0.3, x1: x1 - 0.3, y: y0 + 0.3 * k, y1: y1 - 0.3 * k }
      })
    }),
  },
  start: { x: 0, y: 0 },
  gems: HILLS.map(([x, h]) => ({ x: x + 13, y: h + 1.5 })),
  goal: { x: 150, y: 1 },
  plan: [{ x: 20, speed: 10 }, { x: 52, speed: 14 }, { x: 86, speed: 10 }, { x: 118, speed: 16 }, { x: 154, speed: 5 }],
}

/**
 * 21 · Mästarverket. Everything new at once: the speed strip and a needle's eye over the
 * canyon, landing on a bridge that crumbles behind you, an icy hump with a rock over its top,
 * a trampoline up to the yellow key, the yellow door, and last an icy slope down to a little
 * patch of gravel at the cliff edge, where you have to stop by the flag.
 */
const mastarverket: PuzzleLevel = {
  id: 'n21',
  name: 'Mästarverket',
  hint: 'Allt på en gång. Lycka till!',
  theme: 'crater',
  geom: {
    bottom: -40,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [30, 0], ...kicker(30, 0, 4, 1.2).slice(1), [34, -60], [-14, -60]],
      block(45.6, 6.1, 46.4, 14),
      spike(45.6, 46.4, 3.45, -60),
      // After the crumbling bridge: grit, the icy hump (a rock over its top), grit down, the
      // trampoline, the door, and the icy slope down to the gravel patch at the cliff edge.
      [[82, -60], [82, -4], [96, -4], [102, -3], [105, -1.75], [108, 0], [110, 0], ...ramp(110, 0, 120, -4).slice(1), [176, -4], [188, -8], [194, -8], [194, -60]],
      block(107, 2.6, 115, 12),
      // The high ledge with the key, over the trampoline's right.
      block(136, 6.5, 150, 8),
      // The yellow door's frame: a wall with a gap at the bottom.
      block(158, -1, 161, WALL),
    ],
    pads: [
      { kind: 'boost', x0: 10, x1: 18, y: 0, power: 20 },
      { kind: 'ice', x0: 96.3, x1: 101.7, y: -3.95, y1: -3.05 },
      { kind: 'ice', x0: 102.3, x1: 104.7, y: -2.88, y1: -1.88 },
      { kind: 'ice', x0: 105.3, x1: 107.7, y: -1.57, y1: -0.18 },
      { kind: 'bounce', x0: 128, x1: 132, y: -4, power: 16 },
      { kind: 'ice', x0: 176.3, x1: 187.7, y: -4.1, y1: -7.9 },
    ],
    doors: [{ poly: block(159, -4, 160, -1), key: 2 }],
    crumbles: planks(58, 6, -4, 0.6),
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 46, y: 4.55 }, { x: 109, y: 1.5 }, { x: 142, y: 9 }],
  goal: { x: 191.5, y: -7 },
  goalStill: true,
  plan: [{ x: 18, speed: 20 }, { x: 34, speed: 16.25 }, { x: 96, speed: 12 }, { x: 128, speed: 5 }, { x: 150, speed: 4 }, { x: 176, speed: 2 }, { x: 188, speed: 2, coast: true }, { x: 999, speed: 0 }],
}

/**
 * 22 · Hissen. Lifts and a ferry, all on their own clocks. A lift at the foot of a cliff: drive
 * on when it is down (if it is up, the shaft is empty) and off at the top. A ferry across a
 * chasm, with a gem hanging over its path. Last a lift down into a dark shaft, to the tunnel
 * with the goal: wait for it at the top, and ride it down.
 */
const hissen: PuzzleLevel = {
  id: 'n22',
  name: 'Hissen',
  hint: 'Hissar och en färja, var och en på sin egen klocka. Vänta in dem.',
  theme: 'stunt',
  geom: {
    bottom: -30,
    polygons: [
      // The start, the lift shaft (open below), the cliff top.
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -40], [-14, -40]],
      [[26, -40], [26, 10], [50, 10], [50, -40]],
      // Over the chasm: the far ledge, the shaft down, and the tunnel with the goal.
      [[74, -40], [74, 10], [92, 10], [92, -40]],
      [[98, -40], [98, -2], [130, -2], [130, WALL], [134, WALL], [134, -40]],
      block(98, 1.2, 130, 10),
    ],
    movers: [
      // Down at the start from 5 s to 9 s, at the top from 13 s to 17 s, every 16 s.
      { x0: 20.5, x1: 25.5, y: 0, dx: 0, dy: 10, period: 16, phase: 0.6875 },
      // At this side from 20 s to 23 s, across from 30 s to 33 s, every 20 s.
      { x0: 50.5, x1: 56.5, y: 10, dx: 17, dy: 0, period: 20, dwell: 0.15 },
      // At the top from 34 s to 38.5 s, at the bottom from 43 s to 47.5 s, every 18 s.
      { x0: 92.5, x1: 97.5, y: 10, dx: 0, dy: -12, period: 18, phase: 0.111 },
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 40, y: 11 }, { x: 62, y: 12.5 }, { x: 112, y: -1 }],
  goal: { x: 124, y: -1 },
  plan: [{ x: 16, speed: 4, wait: 5.3 }, { x: 22.5, speed: 3 }, { x: 22.5, speed: 0, wait: 13.2 }, { x: 47, speed: 5, wait: 20.2 }, { x: 52.5, speed: 3 }, { x: 52.5, speed: 0, wait: 30.2 }, { x: 89, speed: 4, wait: 34.3 }, { x: 95, speed: 3 }, { x: 95, speed: 0, wait: 43.2 }, { x: 124, speed: 5 }],
}

/**
 * 23 · Vinden. Air that pushes. A headwind over the first gap eats your speed in the air. An
 * updraft at the foot of a high wall lifts you up it, if you drift through it slowly enough
 * to rise. A tailwind over the last gaps carries you further than you think: take the
 * kickers gently to land on the little island, and then on the goal ledge.
 */
const vinden: PuzzleLevel = {
  id: 'n23',
  name: 'Vinden',
  hint: 'Motvind, uppvind och medvind. Känn efter vart luften vill.',
  theme: 'dunes',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [16, 0], ...kicker(16, 0, 4, 1.2).slice(1), [20, -40], [-14, -40]],
      // After the headwind gap: ground to the updraft, the high wall, its top.
      [[28, -40], [28, 0], [57.5, 0], [57.5, 10], [80, 10], ...kicker(80, 10, 3, 0.8).slice(1), [83, -40]],
      // The island in the tailwind (a kicker at its end), and the goal ledge.
      [[93, -40], [93, 8], [96, 8], ...kicker(96, 8, 2, 0.6).slice(1), [98, -40]],
      [[112, -40], [112, 5], [118, 5], [118, -40]],
      [[132, -40], [132, WALL], [136, WALL], [136, -40]],
    ],
    zones: [
      { x0: 20, x1: 28, y0: -10, y1: 10, ax: -4, ay: 0 },
      { x0: 49, x1: 57, y0: 0, y1: 13, ax: 2.5, ay: 11.5 },
      { x0: 83, x1: 112, y0: -10, y1: 24, ax: 6, ay: 0 },
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 25, y: 4 }, { x: 57.5, y: 14 }, { x: 94.5, y: 9 }],
  goal: { x: 115, y: 6 },
  goalOnGround: true,
  plan: [{ x: 20, speed: 13 }, { x: 49, speed: 2 }, { x: 80, speed: 5 }, { x: 96, speed: 6 }, { x: 115, speed: 7.5 }],
}

/**
 * 24 · Månhoppet. A crater where gravity is weak (a quarter of normal): every jump floats for
 * seconds. Hop onto two small rocks, each a little higher (too soft and you fall short, and
 * the first is only just long enough to land on), with gems at the top of each arc; then a
 * long floating drop to the goal far below, keeping the car level all the way down.
 */
const manhoppet: PuzzleLevel = {
  id: 'n24',
  name: 'Månhoppet',
  hint: 'Svag tyngdkraft: varje hopp svävar länge. Hoppa lagom, och landa rätt.',
  theme: 'crater',
  geom: {
    bottom: -40,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], ...kicker(20, 0, 3, 0.8).slice(1), [23, -50], [-14, -50]],
      pillar(42, 48, 2, -50, { len: 2, h: 0.6 }),
      pillar(66, 71, 5, -50, { len: 2, h: 0.6 }),
      // The goal far below.
      [[96, -50], [96, -14], [104, -14], [104, WALL], [108, WALL], [108, -50]],
    ],
    zones: [{ x0: 23, x1: 104, y0: -30, y1: 60, ax: 0, ay: 7 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 35, y: 5.2 }, { x: 59, y: 7.6 }, { x: 88, y: 4 }],
  goal: { x: 100, y: -13 },
  goalOnGround: true,
  plan: [{ x: 23, speed: 9 }, { x: 48, speed: 8 }, { x: 71, speed: 7 }, { x: 100, speed: 2 }],
}

/**
 * 25 · Färjorna. Three ferries in a row over a chasm, each shuttling back and forth. They meet
 * edge to edge in turn, for a few seconds: drive from one to the next while they wait, and
 * hold still while they glide (both pedals hold the wheels). Drive on too fast and you roll
 * off the far side of a ferry; too early or too late and there is nothing there. A gem hangs
 * over each ferry's way.
 */
const farjorna: PuzzleLevel = {
  id: 'n25',
  name: 'Färjorna',
  hint: 'Byt färja när de möts. Håll i dig medan de glider (båda pedalerna).',
  theme: 'canyon',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -40], [-14, -40]],
      [[82, -40], [82, 0], [100, 0], [100, WALL], [104, WALL], [104, -40]],
    ],
    // Each glides 14 m in 6 s and waits 4 s at each end, every 20 s; neighbours are half a
    // period apart, so one waits at its far end while the next waits at its near end.
    movers: [
      { x0: 20.5, x1: 26.5, y: 0, dx: 14, dy: 0, period: 20, dwell: 0.2 },
      { x0: 41, x1: 47, y: 0, dx: 14, dy: 0, period: 20, dwell: 0.2, phase: 0.5 },
      { x0: 61.5, x1: 67.5, y: 0, dx: 14, dy: 0, period: 20, dwell: 0.2 },
    ],
  },
  start: { x: 8, y: 0 },
  gems: [{ x: 31, y: 2 }, { x: 51, y: 2 }, { x: 72, y: 2 }],
  goal: { x: 92, y: 1 },
  plan: [{ x: 16, speed: 6 }, { x: 22.5, speed: 3 }, { x: 22.5, speed: 0, wait: 10.2 }, { x: 43.5, speed: 3 }, { x: 43.5, speed: 0, wait: 20.2 }, { x: 64, speed: 3 }, { x: 64, speed: 0, wait: 30.2 }, { x: 92, speed: 4 }],
}

/**
 * 26 · Upp och ner. In the pink shaft gravity is turned round: drive off the edge and you
 * fall up, onto the ceiling. Turn the car over on the way up to land on its wheels, then drive
 * along the ceiling, where the pedals feel back to front (the gas takes you left, reverse right).
 * Past the shaft gravity is normal again: drop off the ceiling, turning back over, onto the floor.
 */
const uppOchNer: PuzzleLevel = {
  id: 'n26',
  name: 'Upp och ner',
  hint: 'Här faller du uppåt. Vänd bilen i luften, och kör i taket.',
  theme: 'stunt',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [30, 0], [30, -40], [-14, -40]],
      // The ceiling over the shaft (and on past it), and the floor beyond.
      block(24, 10, 92, 16),
      [[70, -40], [70, 0], [110, 0], [110, WALL], [114, WALL], [114, -40]],
    ],
    zones: [{ x0: 30, x1: 70, y0: -30, y1: 10, ax: 0, ay: 19 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 40, y: 9 }, { x: 60, y: 9 }, { x: 80, y: 3 }],
  goal: { x: 100, y: 1 },
  plan: [{ x: 30, speed: 4 }, { x: 34, speed: 4, air: Math.PI }, { x: 70, speed: 4, flip: true, air: Math.PI }, { x: 100, speed: 4 }],
}

/**
 * 27 · Takdans. A corridor of floor and ceiling pieces, gravity turned round in every other
 * stretch: off the end of the floor you fall up onto the ceiling, off the end of the ceiling
 * you fall back down. Turn the car over in each fall, and change pedal direction each time.
 * The pieces get shorter and the falls quicker; gems hang halfway up each fall.
 */
const takdans: PuzzleLevel = {
  id: 'n27',
  name: 'Takdans',
  hint: 'Golv, tak, golv, tak. Vänd i varje fall, och byt håll på pedalerna.',
  theme: 'stunt',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -40], [-14, -40]],
      // Ceilings (y 9 underside) and floors (y 0) in turn.
      block(20, 9, 44, 14),
      pillar(40, 58, 0),
      block(54, 9, 70, 14),
      pillar(66, 80, 0),
      block(76, 9, 90, 14),
      [[86, -40], [86, 0], [112, 0], [112, WALL], [116, WALL], [116, -40]],
    ],
    zones: [
      { x0: 20, x1: 40, y0: -30, y1: 9, ax: 0, ay: 19 },
      { x0: 58, x1: 66, y0: -30, y1: 9, ax: 0, ay: 19 },
      { x0: 80, x1: 86, y0: -30, y1: 9, ax: 0, ay: 19 },
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 23, y: 4.5 }, { x: 42.5, y: 4.5 }, { x: 60, y: 4.5 }, { x: 68, y: 4.5 }, { x: 83, y: 4.5 }],
  goal: { x: 104, y: 1 },
  plan: [
    { x: 20, speed: 4 }, { x: 24, speed: 4, air: Math.PI },
    { x: 40, speed: 4, flip: true, air: Math.PI }, { x: 44, speed: 4 },
    { x: 58, speed: 4 }, { x: 62, speed: 4, air: Math.PI },
    { x: 66, speed: 4, flip: true, air: Math.PI }, { x: 70, speed: 4 },
    { x: 80, speed: 4 }, { x: 83, speed: 4, air: Math.PI },
    { x: 86, speed: 4, flip: true, air: Math.PI }, { x: 104, speed: 4 },
  ],
}

/**
 * 28 · Rasvind. A crumbling bridge in a headwind: the planks fall behind you and the wind
 * holds you back, so it is full speed or into the gorge. Then ice with the wind at your back
 * towards a short patch of gravel at a cliff edge, with the goal where you must stop: you
 * cannot brake on the ice and the wind keeps pushing, so roll onto it as slowly as you dare.
 */
const rasvind: PuzzleLevel = {
  id: 'n28',
  name: 'Rasvind',
  hint: 'Full fart mot vinden över bron. Sen medvind på isen: rulla på sakta.',
  theme: 'frost',
  geom: {
    bottom: -30,
    polygons: [
      [[-14, WALL], [-12, WALL], [-12, 0], [20, 0], [20, -40], [-14, -40]],
      [[60, -40], [60, 0], [106, 0], [106, -40]],
      [[120, -40], [120, WALL], [124, WALL], [124, -40]],
    ],
    crumbles: planks(20, 10, 0, 0.45),
    pads: [{ kind: 'ice', x0: 74, x1: 99.7, y: 0 }],
    zones: [
      { x0: 20, x1: 60, y0: -10, y1: 10, ax: -4, ay: 0 },
      { x0: 74, x1: 104, y0: -10, y1: 10, ax: 0.6, ay: 0 },
    ],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 30, y: 1.5 }, { x: 50, y: 1.5 }, { x: 87, y: 1.5 }],
  goal: { x: 103, y: 1 },
  goalStill: true,
  plan: [{ x: 60, speed: 16 }, { x: 74, speed: 1 }, { x: 100, speed: 1, coast: true }, { x: 999, speed: 0 }],
}

/**
 * 29 · Nyckelhissen. Two locked doors, each key reached by lift. The yellow key is on top of a
 * tower: ride the lift beside it up, take the key and drive off the tower's far side. Past the
 * yellow door, the blue key waits at the bottom of a pit: one lift down on its near side, one up
 * on its far side, and you change from one to the other at the bottom, when both are there.
 */
const nyckelhissen: PuzzleLevel = {
  id: 'n29',
  name: 'Nyckelhissen',
  hint: 'Nycklarna nås med hiss. Byt hiss på botten när båda är där.',
  theme: 'canyon',
  geom: {
    bottom: -30,
    polygons: [
      // Start, the first lift's shaft, the tower with the yellow key.
      [[-14, WALL], [-12, WALL], [-12, 0], [18, 0], [18, -40], [-14, -40]],
      [[23.5, -40], [23.5, 7], [31, 7], [31, -40]],
      // Below the tower, the yellow door's tunnel, on to the pit.
      [[31, -40], [31, 0], [52, 0], [52, -40]],
      block(36, 2.9, 44, WALL),
      // The pit: two lift shafts and the floor between them.
      [[57.5, -40], [57.5, -10], [60.5, -10], [60.5, -40]],
      // Past the pit: the blue door's tunnel and the goal.
      [[66, -40], [66, 0], [96, 0], [96, WALL], [100, WALL], [100, -40]],
      block(72, 2.9, 80, WALL),
    ],
    movers: [
      // Up the tower: down at the start 3-6.5 s, at the top 10-13.5 s, every 14 s.
      { x0: 18.5, x1: 23.5, y: 0, dx: 0, dy: 7, period: 14, phase: 0.786 },
      // Down into the pit (near side): at the top 0-4 s, at the bottom 8-12 s, every 16 s. Up out
      // of it (far side): at the bottom 8-12 s (with the other), at the top 16-20 s.
      { x0: 52.5, x1: 57.5, y: 0, dx: 0, dy: -10, period: 16 },
      { x0: 60.5, x1: 65.5, y: -10, dx: 0, dy: 10, period: 16, phase: 0.5 },
    ],
    doors: [{ poly: block(39, 0, 40, 2.9), key: 0 }, { poly: block(75, 0, 76, 2.9), key: 1 }],
  },
  start: { x: 0, y: 0 },
  gems: [{ x: 27, y: 8 }, { x: 59, y: -9 }, { x: 88, y: 1 }],
  goal: { x: 90, y: 1 },
  plan: [
    { x: 14, speed: 4, wait: 3.1 }, { x: 21, speed: 3 }, { x: 21, speed: 0, wait: 10.1 },
    { x: 47, speed: 4 }, { x: 55, speed: 3 }, { x: 55, speed: 0, wait: 24.2 },
    { x: 63, speed: 3 }, { x: 63, speed: 0, wait: 32.2 }, { x: 90, speed: 4 },
  ],
}

const LEVELS_RAW: PuzzleLevel[] = [tvaVagar, stopp, lagtITak, gungan, loopenEllerGropen, trappan, fonstret, nalsogat, avsatserna, mastarprovet, gungbradan, dubbelloopen, studsmattan, nyckeln, isbanan, rasbron, turbo, gruvan, raset, bergOchDal, mastarverket, hissen, vinden, manhoppet, farjorna, uppOchNer, takdans, rasvind, nyckelhissen]

/** Every Klurbana, in order (each one opens when the one before is done). */
export const LEVELS: PuzzleLevel[] = [...LEVELS_RAW]

export const puzzleLevel = (id: string) => LEVELS.find((l) => l.id === id)
