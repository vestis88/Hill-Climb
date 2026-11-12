import { beforeEach, describe, expect, it } from 'vitest'
import { environment, heightFor } from '../src/data/environments'
import { runabout } from '../src/data/vehicles'
import { bestOf, roundGhosts, GHOST_EVERY, GhostRecorder, GhostTrack, loadGhost, storeGhost, type Ghost } from '../src/save/ghosts'
import type { SimState } from '../src/sim/types'
import { Sim, STEP } from '../src/sim/world'

/** A tiny in-memory localStorage for the storage tests. */
function fakeStorage(limit = Infinity) {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const used = [...map.entries()].reduce((n, [a, b]) => n + (a === k ? 0 : b.length), 0)
      if (used + v.length > limit) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
  }
}

/** Drive Green Meadows for `seconds`, recording a ghost and keeping every sim state. */
function record(seconds: number) {
  const env = environment('meadow')
  const sim = new Sim({ vehicle: runabout, height: heightFor(env), gravity: env.gravity })
  const rec = new GhostRecorder(runabout.wheels.length)
  const states: SimState[] = []
  for (let i = 0; i < seconds / STEP; i++) {
    const s = sim.state()
    rec.sample(s)
    states.push(s)
    sim.step({ gas: s.chassis.angle < 0.4, brake: false })
  }
  return { ghost: rec.finish({ player: 'Wille', vehicle: 'runabout', env: 'meadow', distance: sim.state().distance }), states }
}

describe('ghosts', () => {
  beforeEach(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
  })

  it('replays the recorded poses: chassis within 1 cm, wheels where they were', () => {
    const { ghost, states } = record(20)
    const track = new GhostTrack(ghost)
    for (const i of [0, 120, 600, 1196]) {
      const s = states[i]
      const p = track.at((i / GHOST_EVERY) / 15)!
      expect(Math.abs(p.chassis.x - s.chassis.x)).toBeLessThan(0.01)
      expect(Math.abs(p.chassis.y - s.chassis.y)).toBeLessThan(0.01)
      expect(Math.abs(p.chassis.angle - s.chassis.angle)).toBeLessThan(0.01)
      // Hub back in world coordinates.
      const c = Math.cos(p.chassis.angle)
      const sn = Math.sin(p.chassis.angle)
      const [hx, hy] = p.hubs[0]
      expect(Math.abs(p.chassis.x + hx * c - hy * sn - s.wheels[0].x)).toBeLessThan(0.02)
      expect(p.fade).toBe(1)
    }
  })

  it('is small enough to keep: a two-minute run is under 80 KB', () => {
    const { ghost } = record(120)
    expect(JSON.stringify(ghost).length).toBeLessThan(80_000)
  })

  it('fades out after its run ended', () => {
    const { ghost } = record(5)
    const track = new GhostTrack(ghost)
    expect(track.at(track.duration + 0.5)!.fade).toBeCloseTo(0.5, 1)
    expect(track.at(track.duration + 2)!.fade).toBe(0)
  })

  it('keeps the best run and the last run per player and track', () => {
    const { ghost } = record(4)
    storeGhost({ ...ghost, distance: 50 })
    storeGhost({ ...ghost, distance: 30 })
    expect(loadGhost('Wille', 'meadow', 'best')!.distance).toBe(50)
    expect(loadGhost('Wille', 'meadow', 'last')!.distance).toBe(30)
    storeGhost({ ...ghost, distance: 70 })
    expect(loadGhost('Wille', 'meadow', 'best')!.distance).toBe(70)
    expect(loadGhost('Frans', 'meadow', 'best')).toBeNull()
  })

  it('drops last-run ghosts to make room for a new best when storage is full', () => {
    const { ghost } = record(4)
    const size = JSON.stringify(ghost).length
    ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage(size * 3.5)
    storeGhost({ ...ghost, player: 'Frans', distance: 10 })
    storeGhost({ ...ghost, player: 'Wille', distance: 20 })
    expect(loadGhost('Wille', 'meadow', 'best')!.distance).toBe(20)
  })
})

describe('the record ghost for a round with several players', () => {
  const g = (player: string, distance: number, time?: number): Ghost => ({ v: 1, player, vehicle: 'runabout', env: 'meadow', distance, time, wheels: 2, data: [1] })

  it('is the furthest endless run, or the fastest race, across everyone', () => {
    expect(bestOf([g('Wille', 300), null, g('Frans', 450), g('Bim', 200)])!.player).toBe('Frans')
    expect(bestOf([g('Wille', 500, 70), g('Frans', 500, 64), g('Bim', 320)])!.player).toBe('Frans')
    expect(bestOf([null, undefined])).toBeNull()
  })
})

describe('ghosts in a round with several players (owner: last and record for everyone)', () => {
  const g = (player: string, distance: number, len = 1): Ghost => ({ v: 1, player, vehicle: 'runabout', env: 'meadow', distance, wheels: 2, data: Array(len).fill(1) })
  const everyone = ['Wille', 'Frans', 'Johan', 'Bim']

  it("shows each player's latest run and record, the overall record once, and no run twice", () => {
    const saved: Record<string, { best?: Ghost; last?: Ghost }> = {
      Wille: { best: g('Wille', 500), last: g('Wille', 120) },
      Frans: { best: g('Frans', 300), last: g('Frans', 300) }, // last run was the record
      Johan: { best: g('Johan', 900), last: g('Johan', 50) }, // not playing, but holds the record
    }
    const stored = (p: string, kind: 'best' | 'last') => saved[p]?.[kind] ?? null
    // Wille already drove this round; Frans has a run from the round before.
    const out = roundGhosts(['Wille', 'Frans', 'Bim'], everyone, [g('Wille', 200, 2)], [g('Frans', 250, 3)], stored)
    expect(out.map((o) => o.label)).toEqual(['Wille rekord', 'Wille senaste', 'Frans rekord', 'Frans senaste', 'Rekord · Johan'])
    expect(out.find((o) => o.label === 'Wille senaste')!.ghost.distance).toBe(200)
    expect(out.find((o) => o.label === 'Frans senaste')!.ghost.distance).toBe(250)
  })

  it('labels the overall record by its holder, and shows a latest run that is the record once', () => {
    const rec = g('Wille', 800)
    const out = roundGhosts(['Wille', 'Frans'], everyone, [], [], (p, kind) => (p === 'Wille' ? rec : kind === 'last' ? g('Frans', 100) : null))
    expect(out.map((o) => o.label)).toEqual(['Rekord · Wille', 'Frans senaste'])
  })
})
