import { describe, expect, it } from 'vitest'
import { LEVELS, puzzleLevel, type PuzzleLevel } from '../src/data/klurbanor'
import { drivePlan } from '../src/game/klurbot'
import { circleHits, groundBelow } from '../src/sim/level'

/** The level with another plan (to show a wrong way fails). */
const withPlan = (id: string, plan: PuzzleLevel['plan']): PuzzleLevel => ({ ...puzzleLevel(id)!, plan })

describe('Klurbanor', () => {
  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))('%s %s can be finished: every gem, then the goal', (_, __, level) => {
    const { run } = drivePlan(level)
    expect(run.gemsLeft).toEqual([])
    expect(run.status).toBe('finished')
    expect(run.finishTime).toBeGreaterThan(3)
  }, 60000)

  it('level geometry: start and goal are on solid ground, gems are in the open', () => {
    for (const l of LEVELS) {
      expect(groundBelow(l.geom, l.start.x, l.start.y + 0.5), l.id).toBeCloseTo(l.start.y, 0)
      for (const g of l.gems) expect(circleHits(l.geom, g.x, g.y, 0.3), `${l.id} gem at ${g.x}`).toBe(false)
      expect(circleHits(l.geom, l.goal.x, l.goal.y, 0.3), `${l.id} goal`).toBe(false)
    }
  })

  it('1 · Två vägar: going fast takes the high road, the loop and the pit', () => {
    const { run } = drivePlan(withPlan('k1', [{ x: 200, speed: 16 }]))
    expect(run.status).toBe('crashed')
    expect(run.gemsLeft.length).toBe(3)
  }, 60000)

  it('2 · Lagom: too slow over the edge drops into the gap before the pillar', () => {
    const { run } = drivePlan(withPlan('k2', [{ x: 38, speed: 9 }, { x: 64, speed: 3 }, { x: 74, speed: 1 }]))
    expect(run.status).toBe('crashed')
  }, 60000)

  it('3 · Lågt i tak: rushing the tunnel (6 m/s or more) bangs your head on the roof', () => {
    expect(drivePlan(withPlan('k3', puzzleLevel('k3')!.plan.map((p, i) => (i === 1 ? { ...p, speed: 6 } : p)))).run.status).toBe('crashed')
    const { run } = drivePlan(withPlan('k3', [{ x: 150, speed: 16 }]))
    expect(run.status).toBe('crashed')
    expect(run.sim.state().chassis.x).toBeLessThan(92)
  }, 60000)

  it('4 · Gungan: just driving at the wall does not get you out', () => {
    const { run } = drivePlan(withPlan('k4', [{ x: 60, speed: 16 }]), 'runabout', 40)
    expect(run.status).not.toBe('finished')
  }, 60000)

  it('6 · Trappan: the first jump only works between 8.5 and 10.5 m/s', () => {
    const rest = puzzleLevel('k6')!.plan.slice(1)
    for (const [speed, ok] of [[8, false], [9.5, true], [11, false]] as const) {
      const { run } = drivePlan(withPlan('k6', [{ x: 20, speed }, ...rest]))
      expect(run.status === 'finished', `${speed} m/s`).toBe(ok)
    }
  }, 60000)

  it('7 · Fönstret: the jump under the rock only works between 11 and 12.5 m/s', () => {
    const rest = puzzleLevel('k7')!.plan.slice(1)
    for (const [speed, ok] of [[10.5, false], [12, true], [14, false]] as const) {
      const { run } = drivePlan(withPlan('k7', [{ x: 30, speed }, ...rest]))
      expect(run.status === 'finished', `${speed} m/s`).toBe(ok)
    }
  }, 60000)

  it('7 · Fönstret: the window needs full speed; short of it you drop onto the lower rock', () => {
    const plan = puzzleLevel('k7')!.plan.map((p) => (p.x === 101 ? { ...p, speed: 10 } : p))
    expect(drivePlan(withPlan('k7', plan)).run.status).toBe('crashed')
  }, 60000)

  it('8 · Nålsögat: each eye has a narrow speed window; flying past the island flag does not count', () => {
    const plan = puzzleLevel('k8')!.plan
    const at = (i: number, speed: number) => plan.map((p, j) => (j === i ? { ...p, speed } : p))
    for (const [i, speed, ok] of [[0, 10.5, false], [0, 11, true], [0, 11.5, false], [1, 9.5, false], [1, 11, false], [2, 14, false]] as const) {
      const { run } = drivePlan(withPlan('k8', at(i, speed)))
      expect(run.status === 'finished', `jump ${i + 1} at ${speed} m/s`).toBe(ok)
    }
  }, 120000)

  it('9 · Avsatserna: the first jump only works around 10 m/s', () => {
    const rest = puzzleLevel('k9')!.plan.slice(1)
    for (const [speed, ok] of [[9.25, false], [10, true], [11.5, false]] as const) {
      const { run } = drivePlan(withPlan('k9', [{ x: 25, speed }, ...rest]))
      expect(run.status === 'finished', `${speed} m/s`).toBe(ok)
    }
  }, 60000)

  it('10 · Mästarprovet: rushing the tunnel, or the last jump too fast, both fail', () => {
    const plan = puzzleLevel('k10')!.plan
    const at = (i: number, speed: number) => plan.map((p, j) => (j === i ? { ...p, speed } : p))
    expect(drivePlan(withPlan('k10', at(4, 10))).run.status).toBe('crashed')
    expect(drivePlan(withPlan('k10', at(5, 10.5))).run.status).toBe('crashed')
  }, 120000)

  it('11 · Gungbrädan: only 5 to 7 m/s gets across (slower cannot jump off the plank, faster hits the roof)', () => {
    for (const [speed, ok] of [[4, false], [6, true], [8, false]] as const) {
      const { run } = drivePlan(withPlan('k11', [{ x: 30, speed }, { x: 92, speed }]))
      expect(run.status === 'finished', `${speed} m/s`).toBe(ok)
    }
  }, 60000)

  it('12 · Dubbelloopen: losing speed before the kicker drops you into the pit', () => {
    const plan = puzzleLevel('k12')!.plan.map((p) => (p.x === 74 ? { ...p, speed: 9 } : p))
    expect(drivePlan(withPlan('k12', plan)).run.status).toBe('crashed')
  }, 60000)

  /** The level's plan with step i's speed changed. */
  const at = (id: string, i: number, speed: number) => puzzleLevel(id)!.plan.map((p, j) => (j === i ? { ...p, speed } : p))
  const ends = (id: string, plan: PuzzleLevel['plan'], limit = 60) => drivePlan(withPlan(id, plan), 'runabout', limit).run.status

  it('13 · Studsmattan: the deep pit only works between about 3.5 and 7 m/s', () => {
    for (const [speed, ok] of [[3, false], [5.5, true], [7.5, false]] as const) expect(ends('n13', at('n13', 2, speed)) === 'finished', `${speed} m/s`).toBe(ok)
  }, 120000)

  it('14 · Nyckeln: the yellow door stays shut without the key behind you; backing up too fast flies off the ledge', () => {
    expect(ends('n14', [{ x: 100, speed: 6 }], 40)).not.toBe('finished')
    expect(ends('n14', at('n14', 0, -6.5))).toBe('crashed')
  }, 120000)

  it('15 · Isbanan: the icy hump only works between 10.5 and 12 m/s (you must stop on its top)', () => {
    for (const [speed, ok] of [[10, false], [11, true], [12.5, false]] as const) expect(ends('n15', at('n15', 2, speed)) === 'finished', `${speed} m/s`).toBe(ok)
  }, 120000)

  it('16 · Rasbron: too slow over the first bridge and it falls under you', () => {
    expect(ends('n16', [{ x: 20, speed: 8 }, { x: 44, speed: 8 }, ...puzzleLevel('n16')!.plan.slice(2)])).toBe('crashed')
  }, 120000)

  it('17 · Turbo: the needle needs 15.5 to 16.5 m/s after braking; landing on the last strip throws you off the cliff', () => {
    for (const [speed, ok] of [[15, false], [16.25, true], [17, false]] as const) expect(ends('n17', at('n17', 1, speed)) === 'finished', `${speed} m/s`).toBe(ok)
    expect(ends('n17', at('n17', 4, 7))).toBe('crashed')
  }, 120000)

  it('18 · Gruvan: too slow off the ledge drops you back into the mine', () => {
    expect(ends('n18', at('n18', 2, 7), 70)).not.toBe('finished')
  }, 120000)

  it('19 · Raset: too slow over the first planks and they fall into the void', () => {
    expect(ends('n19', at('n19', 0, 6))).toBe('crashed')
  }, 120000)

  it('20 · Berg-och-dal: too fast up the first hill hits the rock; too slow up the second slides back', () => {
    expect(ends('n20', at('n20', 0, 13))).toBe('crashed')
    expect(ends('n20', at('n20', 1, 12))).not.toBe('finished')
  }, 120000)

  it('21 · Mästarverket: rolling onto the last ice too fast slides you over the edge', () => {
    expect(ends('n21', at('n21', 5, 4), 80)).not.toBe('finished')
  }, 120000)

  it('22 · Hissen: rushing at the lift (it is up) drops you down the empty shaft', () => {
    expect(ends('n22', [{ x: 124, speed: 6 }])).toBe('crashed')
  }, 120000)

  it('23 · Vinden: the headwind over the first gap needs nearly full speed', () => {
    expect(ends('n23', at('n23', 0, 10))).toBe('crashed')
  }, 120000)

  it('24 · Månhoppet: too soft off the first kicker falls short of the rock', () => {
    expect(ends('n24', at('n24', 0, 7))).toBe('crashed')
  }, 120000)

  it('25 · Färjorna: driving straight on falls into the chasm; waiting for each ferry works', () => {
    expect(ends('n25', [{ x: 92, speed: 4 }])).toBe('crashed')
  }, 120000)

  it('26 · Upp och ner: falling up without turning the car over lands it on its roof', () => {
    const plan = puzzleLevel('n26')!.plan.map((p) => ({ ...p, air: 0 }))
    expect(ends('n26', plan)).not.toBe('finished')
  }, 120000)

  it('27 · Takdans: rushing through flies past the gems in the falls', () => {
    const plan = puzzleLevel('n27')!.plan.map((p) => ({ ...p, speed: 8 }))
    expect(ends('n27', plan)).not.toBe('finished')
  }, 120000)

  it('28 · Rasvind: too slow over the bridge into the wind falls; onto the ice too fast slides off the cliff', () => {
    expect(ends('n28', at('n28', 0, 11))).toBe('crashed')
    expect(ends('n28', at('n28', 1, 7))).toBe('crashed')
  }, 120000)

  it('29 · Nyckelhissen: driving onto the tower lift while it is up drops you down the shaft', () => {
    expect(ends('n29', [{ x: 14, speed: 4, wait: 10 }, ...puzzleLevel('n29')!.plan.slice(1)])).toBe('crashed')
  }, 120000)
  it('30 · Studstornet: rushing into the updraft blows you past the ledge; too slow off the top trampoline falls short', () => {
    expect(ends('n30', at('n30', 0, 6))).toBe('crashed')
    expect(ends('n30', at('n30', 2, 4.5))).toBe('crashed')
  }, 120000)

  it('31 · Isloopen: easing off in the loop rolls you back out of it', () => {
    expect(ends('n31', at('n31', 2, 6))).not.toBe('finished')
  }, 120000)

  it('32 · Tunga hoppet: braking after the speed strip drops you in the heavy air', () => {
    expect(ends('n32', at('n32', 1, 5))).toBe('crashed')
  }, 120000)

  it('33 · Spegelvägen: too slow off the upside-down kicker falls up into the pit', () => {
    expect(ends('n33', at('n33', 2, 5))).not.toBe('finished')
  }, 120000)

  it('34 · Byvind: full speed with the wind flies over the low gem', () => {
    expect(ends('n34', at('n34', 1, 12))).not.toBe('finished')
  }, 120000)

  it('35 · Rasgropen: driving straight over the bridge leaves you at a locked door', () => {
    expect(ends('n35', [{ x: 86, speed: 9 }])).not.toBe('finished')
  }, 120000)

  it('36 · Studsstegen: too slow or too fast between the trampolines lands on the spikes', () => {
    expect(ends('n36', [{ x: 78, speed: 5 }])).not.toBe('finished')
    expect(ends('n36', [{ x: 78, speed: 12 }])).not.toBe('finished')
  }, 120000)

  it('37 · Tyngdlöst: too slow drifts into the wall under the window', () => {
    expect(ends('n37', at('n37', 0, 8))).toBe('crashed')
  }, 120000)

  it('38 · Klättringen: driving onto the first lift while it is up drops you down the shaft', () => {
    expect(ends('n38', [{ x: 23, speed: 3 }, ...puzzleLevel('n38')!.plan.slice(2)])).toBe('crashed')
  }, 120000)

  it('39 · Finalen: too slow over the bridge falls with it', () => {
    expect(ends('n39', at('n39', 0, 8))).toBe('crashed')
  }, 120000)
})

