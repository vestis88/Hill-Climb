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
   * also ends the step once the vehicle has dropped below that height.
   */
  plan: { x: number; speed: number; air?: number; pump?: number; coast?: boolean; below?: number }[]
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
  plan: [{ x: -26, speed: -3 }, { x: 45, speed: 7 }, { x: 73, speed: 7 }, { x: 61, speed: -2 }, { x: 100, speed: 5 }],
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
  plan: [{ x: 20, speed: 10 }, { x: 44, speed: 10 }, { x: 64, speed: 3 }, { x: 999, speed: 0, below: -5 }, { x: 110, speed: 5 }, { x: 150, speed: 14 }],
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

const LEVELS_RAW: PuzzleLevel[] = [tvaVagar, stopp, lagtITak, gungan, loopenEllerGropen, trappan, fonstret, nalsogat, avsatserna, mastarprovet, gungbradan, dubbelloopen, studsmattan, nyckeln, isbanan, rasbron, turbo, gruvan, raset, bergOchDal, mastarverket]

/** Every Klurbana, in order (each one opens when the one before is done). */
export const LEVELS: PuzzleLevel[] = [...LEVELS_RAW]

export const puzzleLevel = (id: string) => LEVELS.find((l) => l.id === id)
