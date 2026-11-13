/**
 * Klurbana generator. Run with: npm run levelgen (writes src/data/klurbanor-gen.ts).
 *
 * Levels are chains of modules (jumps, jumps under a rock, needle's eyes, loops, roller tunnels,
 * seesaw gaps, ledges with roofs) ending in a jump onto a goal island. Each module carries its
 * own run-up, so it can be tried on its own: the scripted driver (src/game/klurbot.ts) drives it
 * from rest at a range of speeds, which gives the module's speed window. Rocks, eyes and air
 * gems are placed on the arc measured at the chosen speed. A module's settings are drawn again
 * until its window suits the level's difficulty (wide early on, about 1 m/s at the end).
 * Each assembled level is then driven start to finish; if that fails, the failing module gets a
 * longer run-up, or the level is drawn again. Levels are sorted by measured difficulty.
 */
import { it } from 'vitest'
// @ts-ignore: scripts run in node
import { writeFileSync } from 'node:fs'
import { block, ground, kicker, spike, type PuzzleLevel } from '../src/data/klurbanor'
import { drivePlan } from '../src/game/klurbot'
import type { Pt } from '../src/sim/level'

const COUNT = Number((globalThis as { process?: { env: Record<string, string> } }).process?.env.LEVELS ?? 30)
const WALL = 30
const BOTTOM = -30

type Kind = 'jump' | 'rock' | 'eye' | 'loop' | 'tunnel' | 'seesaw' | 'ledge' | 'island'
interface Mod {
  kind: Kind
  R: number
  p: Record<string, number>
  v: number
  /** The measured arc at the module's speed, relative to the module's start (rock, eye, air gem). */
  arc?: { dx: number; dy: number }
}

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const r2 = (x: number) => Math.round(x * 100) / 100

/** Builds a level left to right: the current floor is an open surface, closed at each gap. */
class Builder {
  polys: Pt[][] = []
  loops: { cx: number; cy: number; r: number }[] = []
  seesaws: { x: number; y: number; length: number; density?: number }[] = []
  gems: { x: number; y: number }[] = []
  plan: PuzzleLevel['plan'] = []
  run: Pt[]
  goal = { x: 0, y: 0 }
  goalOnGround = false
  constructor(y = 0) {
    this.polys.push([[-14, WALL], [-12, WALL], [-12, -40], [-14, -40]])
    this.run = [[-12, y], [0, y]]
  }
  get x(): number {
    return this.run[this.run.length - 1][0]
  }
  get y(): number {
    return this.run[this.run.length - 1][1]
  }
  flat(len: number): void {
    this.run.push([this.x + len, this.y])
  }
  push(pts: Pt[]): void {
    for (const p of pts) if (p[0] > this.x + 1e-6) this.run.push(p)
  }
  close(): void {
    this.polys.push(ground(this.run, -40))
  }
  start(x: number, y: number): void {
    this.run = [[x, y]]
  }
  /** After the last module in a trial: a flat run-out, the goal, and a wall. */
  runOut(): void {
    this.flat(25)
    this.goal = { x: this.x - 6, y: this.y + 1 }
    this.plan.push({ x: this.goal.x, speed: 4 })
    this.run.push([this.x, WALL], [this.x + 4, WALL])
    this.close()
  }
  level(id: string): PuzzleLevel {
    return {
      id, name: id, hint: '', theme: 'meadow',
      geom: { bottom: BOTTOM, polygons: this.polys, loops: this.loops, seesaws: this.seesaws },
      start: { x: 0, y: this.polys.length ? this.run[0][1] : 0 }, gems: this.gems, goal: this.goal, goalOnGround: this.goalOnGround, plan: this.plan,
    }
  }
}

/** Adds one module at the builder's cursor. With no arc yet, rocks, eyes and air gems are left out. */
function build(b: Builder, m: Mod): void {
  const x0 = b.x
  const y0 = b.y
  const arcAt = m.arc ? { x: x0 + m.arc.dx, y: y0 + m.arc.dy } : null
  switch (m.kind) {
    case 'jump':
    case 'rock':
    case 'eye': {
      b.flat(m.R)
      b.push(kicker(b.x, b.y, 4, m.p.kh))
      const lip = b.x
      b.plan.push({ x: lip, speed: m.v })
      b.close()
      const land = lip + m.p.gap
      if (arcAt) {
        if (m.kind !== 'jump') b.polys.push(block(arcAt.x - 0.4, arcAt.y + 1.3 + m.p.margin, arcAt.x + 0.4, arcAt.y + 14))
        if (m.kind === 'eye') b.polys.push(spike(arcAt.x - 0.4, arcAt.x + 0.4, arcAt.y - 0.8 - m.p.margin))
        b.gems.push({ x: arcAt.x, y: arcAt.y })
      }
      b.start(land, y0 + m.p.dy)
      break
    }
    case 'loop': {
      b.flat(m.R)
      const cx = b.x + 3.4
      b.loops.push({ cx, cy: y0 + 3.4, r: 3.4 })
      b.gems.push({ x: cx, y: y0 + 5.9 })
      b.plan.push({ x: cx - 3.4, speed: m.v }, { x: cx + 8, speed: 14 })
      b.flat(6.8 + 8)
      break
    }
    case 'tunnel': {
      b.flat(m.R)
      const xs = b.x
      const L = m.p.len
      const f = (x: number) => y0 + (x > xs && x < xs + L ? 0.45 * Math.sin((Math.PI * (x - xs)) / 4.5) ** 2 : 0)
      const surf: Pt[] = []
      for (let x = xs; x <= xs + L + 1e-6; x += 0.5) surf.push([x, f(x)])
      b.push(surf)
      const top: Pt[] = []
      for (let x = xs + 2; x <= xs + L - 2 + 1e-6; x += 0.5) top.push([x, f(x) + m.p.clear])
      b.polys.push([[top[0][0], y0 + m.p.clear + 4], [top[top.length - 1][0], y0 + m.p.clear + 4], ...[...top].reverse()])
      b.gems.push({ x: xs + 4.5 * Math.round(L / 9), y: y0 + 0.9 })
      b.plan.push({ x: xs + L, speed: m.v })
      b.flat(4)
      break
    }
    case 'seesaw': {
      b.flat(m.R)
      const px = b.x + 3.6
      b.close()
      b.polys.push(block(px - 0.2, -40, px + 0.2, y0 + 0.2), block(px + 0.6, y0 + 4.1, px + 5, y0 + 8))
      b.seesaws.push({ x: px, y: y0 + 1.1, length: 8, density: 15 })
      b.gems.push({ x: px, y: y0 + 2.3 })
      b.plan.push({ x: px + 6, speed: m.v })
      b.start(px + 6, y0 - 0.8)
      break
    }
    case 'ledge': {
      b.flat(m.R)
      b.push(kicker(b.x, b.y, 3, 1.4))
      const lip = b.x
      b.plan.push({ x: lip, speed: m.v })
      b.close()
      const nx = lip + m.p.gap
      const ny = y0 + 2.3
      b.polys.push(block(nx - 1, ny + 3.1, nx + 5, ny + 5.5))
      b.gems.push({ x: nx + 3, y: ny + 1 })
      b.start(nx, ny)
      break
    }
    case 'island': {
      b.flat(m.R)
      b.push(kicker(b.x, b.y, 4, 1.2))
      const lip = b.x
      b.close()
      const ix = lip + m.p.gap
      const iy = y0 + m.p.dy
      b.polys.push([[ix, iy], [ix + m.p.w, iy], [ix + m.p.w, -40], [ix, -40]])
      b.goal = { x: ix + m.p.w / 2, y: iy + 1 }
      b.goalOnGround = true
      b.plan.push({ x: lip, speed: m.v }, { x: b.goal.x, speed: 0.5 })
      b.polys.push([[ix + m.p.w + 14, WALL], [ix + m.p.w + 18, WALL], [ix + m.p.w + 18, -40], [ix + m.p.w + 14, -40]])
      break
    }
  }
}

/** One module on its own, from rest; true when the run reaches the goal. */
function trial(m: Mod, path?: [number, number][]): boolean {
  const b = new Builder(0)
  b.flat(2)
  build(b, m)
  if (m.kind !== 'island') b.runOut()
  const { run, path: p } = drivePlan(b.level('t'), 'runabout', 45)
  if (path) path.push(...p)
  return run.status === 'finished'
}

/** The run of working speeds around the best one, at 0.5 m/s steps (then refined at the edges). */
function window(m: Mod, speeds = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]): { lo: number; hi: number; v: number } | null {
  const ok = speeds.map((v) => trial({ ...m, v }))
  let best: [number, number] | null = null
  for (let i = 0; i < speeds.length; i++) {
    if (!ok[i]) continue
    let j = i
    while (j + 1 < speeds.length && ok[j + 1]) j++
    if (!best || j - i > best[1] - best[0]) best = [i, j]
    i = j
  }
  if (!best) return null
  let lo = speeds[best[0]]
  let hi = speeds[best[1]]
  // Refine each edge to a quarter m/s.
  for (const d of [-0.75, -0.5, -0.25]) if (lo + d >= 2 && trial({ ...m, v: lo + d })) { lo = lo + d; break }
  for (const d of [0.75, 0.5, 0.25]) if (hi + d <= 16 && trial({ ...m, v: hi + d })) { hi = hi + d; break }
  return { lo, hi, v: (lo + hi) / 2 }
}

/** Where the arc at speed v passes x (relative to the module start), from a trial run. */
function arcAt(m: Mod, dx: number): number | null {
  const path: [number, number][] = []
  trial(m, path)
  // The module starts at x = 2, y = 0 in a trial.
  let best: [number, number] | null = null
  for (const p of path) if (!best || Math.abs(p[0] - (2 + dx)) < Math.abs(best[0] - (2 + dx))) best = p
  return best && Math.abs(best[0] - (2 + dx)) < 0.6 ? best[1] : null
}

const KINDS_BY_STAGE: Kind[][] = [
  ['jump', 'jump', 'loop', 'tunnel', 'rock'],
  ['jump', 'rock', 'loop', 'tunnel', 'seesaw', 'ledge', 'eye'],
  ['rock', 'eye', 'eye', 'loop', 'tunnel', 'seesaw', 'ledge', 'jump'],
]

/** Draw a module for difficulty d and fit it; null if nothing workable was found. */
function makeModule(kind: Kind, d: number, rand: () => number, log: string[]): Mod | null {
  const target = lerp(4, 0.9, d)
  let bestMod: Mod | null = null
  let bestErr = Infinity
  for (let attempt = 0; attempt < 8; attempt++) {
    const R = lerp(26, 13, d) + rand() * 4
    const m: Mod = { kind, R, v: 8, p: {} }
    if (kind === 'jump' || kind === 'rock' || kind === 'eye') m.p = { kh: 1 + rand() * 0.6, gap: lerp(5.5, 8.5, d) + rand() * 1.5, dy: Math.round((rand() * 4 - 3) * 2) / 2, margin: lerp(0.9, 0.3, d) + rand() * 0.15 }
    if (kind === 'tunnel') m.p = { len: Math.round(lerp(18, 30, d) / 4.5) * 4.5, clear: lerp(3.1, 2.7, d) }
    if (kind === 'ledge') m.p = { gap: 5.5 + rand() * 1.5 }
    if (kind === 'island') m.p = { gap: lerp(7, 10, d) + rand() * 1.5, dy: -1 - rand() * 3, w: lerp(8, 3.6, d) }
    let w = window(m)
    if (!w) continue
    m.v = w.v
    if (kind === 'jump' || kind === 'rock' || kind === 'eye') {
      // Build the arc for a mid-range speed (the top of the range is just "full gas").
      const want = 8 + rand() * 3
      m.v = Math.min(w.hi - 0.75, Math.max(w.lo + 0.5, want))
      if (m.v > 12.5) continue
      // Place the rock / eye / air gem on the arc at this speed, over the middle of the gap.
      const dx = m.R + 4 + m.p.gap / 2
      const y = arcAt(m, dx)
      if (y === null) continue
      m.arc = { dx, dy: y }
      const placed = m.v
      w = window(m)
      if (!w || w.lo > placed || w.hi < placed) continue
      m.v = w.v
    }
    const width = w.hi - w.lo
    // One-sided pieces (loops, tunnels) are as they are; the others should suit the difficulty.
    const err = kind === 'loop' || kind === 'tunnel' ? 0 : Math.abs(Math.log(Math.max(0.25, width) / target))
    if (err < bestErr) {
      bestErr = err
      bestMod = { ...m, p: { ...m.p, lo: w.lo, hi: w.hi } }
    }
    if (err < 0.45) break
  }
  if (bestMod) log.push(`  ${kind}: v ${bestMod.v.toFixed(2)} window ${bestMod.p.lo}-${bestMod.p.hi}`)
  return bestMod
}

function assemble(mods: Mod[]): Builder {
  const b = new Builder(0)
  b.flat(2)
  for (const m of mods) build(b, m)
  return b
}

const NAMES = [
  'Lilla hoppet', 'Kullerbyttan', 'Fjärilen', 'Brovakten', 'Myrstigen', 'Sotarbacken', 'Klippkanten', 'Vindbryggan',
  'Kråkslottet', 'Tornseglaren', 'Stenbocken', 'Grottstigen', 'Måsklippan', 'Spindeltråden', 'Isflaket', 'Ökenrävens väg',
  'Jättetrappan', 'Nattflykten', 'Skärgården', 'Drakryggen', 'Örnnästet', 'Tusen nålar', 'Stormfågeln', 'Glasbron',
  'Svarta hålet', 'Månbron', 'Järnkronan', 'Kometen', 'Djävulsbryggan', 'Slutstriden',
]
const THEMES = ['meadow', 'canyon', 'woods', 'dunes', 'frost', 'crater', 'stunt']
const WORD: Record<Kind, string> = { jump: 'hopp', rock: 'klippa', eye: 'nålsöga', loop: 'loop', tunnel: 'tunnel', seesaw: 'gungbräda', ledge: 'avsats', island: 'ön' }

it('levelgen', () => {
  const log: string[] = []
  const levels: { level: PuzzleLevel; score: number; kinds: Kind[] }[] = []
  for (let i = 0; i < COUNT; i++) {
    const d = COUNT === 1 ? 0.5 : i / (COUNT - 1)
    for (let attempt = 0; attempt < 6; attempt++) {
      const rand = rng(1000 + i * 97 + attempt * 7919)
      const stage = KINDS_BY_STAGE[Math.min(2, Math.floor(d * 3))]
      const n = 3 + Math.floor(d * 4.5)
      const kinds: Kind[] = []
      for (let k = 0; k < n; k++) {
        let kind = stage[Math.floor(rand() * stage.length)]
        if (k > 0 && kind === kinds[k - 1]) kind = stage[Math.floor(rand() * stage.length)]
        kinds.push(kind)
      }
      kinds.push('island')
      log.push(`level ${i} d ${d.toFixed(2)} try ${attempt}: ${kinds.join(' ')}`)
      const mods: Mod[] = []
      let ok = true
      for (const kind of kinds) {
        const m = makeModule(kind, d, rand, log)
        if (!m) {
          ok = false
          break
        }
        mods.push(m)
      }
      if (!ok) continue
      // The whole level, driven start to finish; lengthen run-ups where it fails.
      let done = false
      for (let fix = 0; fix < 5 && !done; fix++) {
        const b = assemble(mods)
        const lvl = b.level(`g${i}`)
        const { run } = drivePlan(lvl, 'runabout', 240)
        if (run.status === 'finished' && run.gemsLeft.length === 0) {
          done = true
          const score = mods.reduce((s, m) => s + (m.kind === 'loop' || m.kind === 'tunnel' ? 0.4 : 1 / Math.max(0.3, m.p.hi - m.p.lo)), 0) + mods.length * 0.3
          levels.push({ level: lvl, score, kinds })
          log.push(`  OK in ${(run.finishTime ?? 0).toFixed(1)} s, score ${score.toFixed(2)}`)
        } else {
          // Find the module where it went wrong (by x) and give it a longer run-up.
          const x = run.sim.state().chassis.x
          let at = 0
          let cursor = 2
          const probe = new Builder(0)
          probe.flat(2)
          for (let k = 0; k < mods.length; k++) {
            build(probe, mods[k])
            if (x < probe.x + 2) {
              at = k
              break
            }
            cursor = probe.x
            at = k
          }
          void cursor
          mods[at] = { ...mods[at], R: mods[at].R + 6 }
          if (at + 1 < mods.length) mods[at + 1] = { ...mods[at + 1], R: mods[at + 1].R + 4 }
          log.push(`  failed at x ${x.toFixed(1)} (${run.status}); longer run-up for module ${at}`)
        }
      }
      if (done) break
    }
  }
  // Easiest first; names and looks in that order.
  levels.sort((a, b) => a.score - b.score)
  const out = levels.map(({ level, kinds }, i) => {
    const words = kinds.map((k) => WORD[k])
    const hint = `${words.slice(0, -1).join(', ')}, sen ${words[words.length - 1]}.`.replace(/^./, (c) => c.toUpperCase())
    const round = (pts: Pt[]) => pts.map(([x, y]) => [r2(x), r2(y)])
    return {
      ...level,
      id: `k${13 + i}`,
      name: NAMES[i] ?? `Bana ${13 + i}`,
      hint,
      theme: THEMES[i % THEMES.length],
      geom: { ...level.geom, polygons: level.geom.polygons.map(round) },
      gems: level.gems.map((g) => ({ x: r2(g.x), y: r2(g.y) })),
      goal: { x: r2(level.goal.x), y: r2(level.goal.y) },
      plan: level.plan.map((p) => ({ ...p, x: r2(p.x), speed: r2(p.speed) })),
    }
  })
  const ts = `import type { PuzzleLevel } from './klurbanor'

/**
 * Generated by scripts/levelgen.sim.ts (npm run levelgen): ${out.length} Klurbanor of increasing
 * difficulty, each proven by its scripted driver (plan). Do not edit by hand; regenerate.
 */
export const GENERATED: PuzzleLevel[] = ${JSON.stringify(out)}
`
  writeFileSync('src/data/klurbanor-gen.ts', ts)
  writeFileSync('levelgen.log', log.join('\n'))
}, 7200000)
