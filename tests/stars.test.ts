import { describe, expect, it } from 'vitest'
import { ENVIRONMENTS, heightFor } from '../src/data/environments'
import { dailyFor } from '../src/data/daily'
import { starsFor } from '../src/game/stars'

describe('hidden stars', () => {
  it('every map has three, high above the ground and spread along the track', () => {
    for (const env of ENVIRONMENTS) {
      const stars = starsFor(env)
      expect(stars, env.id).toHaveLength(3)
      for (const s of stars) expect(s.y - heightFor(env)(s.x)).toBeGreaterThan(3)
      expect(stars[0].x).toBeGreaterThan(200)
      expect(new Set(stars.map((s) => s.id)).size).toBe(3)
    }
  })

  it('the daily challenge has none', () => {
    expect(starsFor(dailyFor('2027-03-14').env)).toEqual([])
  })
})

import { fixedPickups } from '../src/data/track'
import { runabout } from '../src/data/vehicles'
import { Run } from '../src/sim/run'
import { flat } from '../src/sim/terrain'
import { STEP } from '../src/sim/world'

describe('collecting a star', () => {
  it('is found once when the vehicle touches it', () => {
    const run = new Run({ vehicle: runabout, height: flat, pickups: fixedPickups([]), bestDistance: 1e9, stars: [{ id: 'star:test:0', x: 15, y: 1.2 }] })
    let events = 0
    for (let i = 0; i < 6 / STEP; i++) {
      run.step({ gas: true, brake: false })
      events += run.events.filter((e) => e.kind === 'star').length
    }
    expect(run.starsFound).toEqual(['star:test:0'])
    expect(events).toBe(1)
  })
})
