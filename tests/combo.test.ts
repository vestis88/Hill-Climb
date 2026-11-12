import { describe, expect, it } from 'vitest'
import { fixedPickups } from '../src/data/track'
import { runabout } from '../src/data/vehicles'
import { Run, RULES } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

type Inner = { addTrick(v: number): void; comboClock(s: unknown): void }
const onGround = { airborne: false }
const newRun = () => new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9 })
/** Seconds on the ground, ticking the combo clock. */
function ground(run: Run, seconds: number) {
  for (let i = 0; i < seconds / STEP; i++) (run as unknown as Inner).comboClock(onGround)
}

describe('combos (owner: chained tricks multiply each other)', () => {
  it('pays a bonus for a chain of tricks once the chain ends on the ground', () => {
    const run = newRun()
    const inner = run as unknown as Inner
    inner.addTrick(100) // a flip
    ground(run, 1)
    inner.addTrick(40) // air time
    ground(run, 1)
    inner.addTrick(60) // a wheelie
    expect(run.combo).toEqual({ tricks: 3, coins: 200 })
    ground(run, RULES.comboGap + 0.1)
    expect(run.combo).toBeNull()
    // Three tricks: ×2, so the bonus is the tricks' 200 again.
    expect(run.coins.combos).toBe(200)
    expect(run.events.some((e) => e.kind === 'combo')).toBe(true)
  })

  it('a single trick is no combo, and the multiplier tops out at ×4', () => {
    const run = newRun()
    ;(run as unknown as Inner).addTrick(100)
    ground(run, RULES.comboGap + 0.1)
    expect(run.coins.combos).toBe(0)
    expect([2, 3, 4, 7, 20].map(RULES.comboMultiplier)).toEqual([1.5, 2, 2.5, 4, 4])
  })

  it('a crash loses the chain', () => {
    const run = newRun()
    const inner = run as unknown as Inner
    inner.addTrick(100)
    inner.addTrick(100)
    run.status = 'crashed'
    run.step({ gas: false, brake: false })
    expect(run.combo).toBeNull()
    expect(run.coins.combos).toBe(0)
    expect(run.events.some((e) => e.kind === 'comboLost')).toBe(true)
  })

  it('ending the run any other way pays it', () => {
    const run = newRun()
    const inner = run as unknown as Inner
    inner.addTrick(100)
    inner.addTrick(100)
    run.endCombo()
    expect(run.coins.combos).toBe(100)
    expect(run.totalCoins).toBe(100)
  })
})
