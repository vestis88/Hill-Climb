import { describe, expect, it } from 'vitest'
import { dailyFor, oldDaily, steepest } from '../src/data/daily'
import { environment, heightFor, puddlesFor } from '../src/data/environments'
import { applyUpgrades } from '../src/data/upgrades'
import { vehicleEntry } from '../src/data/vehicles'
import { stageTime } from '../src/sim/stage'

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const [y, m, d] = from.split('-').map(Number)
  return new Date(y, m - 1, d + i)
})

describe('daily challenge (owner: 500 m race and endless, two random vehicles at a balanced tuning)', () => {
  it('is the same track, vehicles and tuning for everyone on the same date, and changes day to day', () => {
    const a = dailyFor('2027-03-14')
    const b = dailyFor(new Date(2027, 2, 14))
    expect(b).toBe(a)
    expect(heightFor(a.env)(321.5)).toBe(heightFor(dailyFor('2027-03-14').env)(321.5))
    const month = days('2027-03-01', 31).map((d) => dailyFor(d))
    expect(new Set(month.map((d) => d.env.id)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(month.map((d) => d.style)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(month.map((d) => d.env.seed)).size).toBe(31)
  })

  it('uses two different vehicles, each tuned around level 5 with the same total', () => {
    for (const d of days('2027-01-01', 120).map((x) => dailyFor(x))) {
      expect(d.race.vehicle).not.toBe(d.endless.vehicle)
      for (const ev of [d.race, d.endless]) {
        const ids = vehicleEntry(ev.vehicle).upgrades.map((u) => u.id)
        const levels = ids.map((id) => ev.levels[id])
        expect(Math.min(...levels)).toBeGreaterThanOrEqual(3)
        expect(Math.max(...levels)).toBeLessThanOrEqual(7)
        expect(levels.reduce((a, b) => a + b, 0)).toBe(20)
      }
    }
  })

  it('is never steeper than its base map (a whole year)', () => {
    for (const d of days('2027-01-01', 365).map((x) => dailyFor(x))) {
      expect(steepest(d.env), d.date).toBeLessThanOrEqual(steepest(environment(d.env.id)) * 1.08 + 1e-9)
    }
  }, 60000)

  it('can be driven: a scripted driver finishes 500 m in both events on a month of tracks', () => {
    const misses: string[] = []
    for (const d of days('2027-02-01', 28).map((x) => dailyFor(x))) {
      const opts = { gravity: d.env.gravity, groundFriction: d.env.groundFriction, puddles: puddlesFor(d.env) }
      for (const ev of [d.race, d.endless]) {
        const v = vehicleEntry(ev.vehicle)
        const t = stageTime(applyUpgrades(v.base, v.full, ev.levels), heightFor(d.env), opts).time
        if (t === null || t > 80) misses.push(`${d.date} ${d.env.id} ${d.style} ${ev.vehicle} ${t}`)
      }
    }
    // The scripted driver is cruder than a player; allow it one miss in the month.
    expect(misses.length, misses.join('\n')).toBeLessThanOrEqual(1)
  }, 120000)

  it('has weather picked by the date; rain and snow make the ground slippery', () => {
    const month = days('2027-03-01', 60).map((x) => dailyFor(x))
    expect(new Set(month.map((d) => d.atmosphere.weather)).size).toBeGreaterThanOrEqual(3)
    for (const d of month) {
      const base = environment(d.env.id).groundFriction
      if (d.atmosphere.weather === 'rain' || d.atmosphere.weather === 'snow') expect(d.env.groundFriction).toBeLessThan(base)
      else expect(d.env.groundFriction).toBe(base)
    }
    expect(dailyFor('2027-03-14').atmosphere).toEqual(dailyFor(new Date(2027, 2, 14)).atmosphere)
  })

  it('drops records older than two weeks', () => {
    expect(oldDaily('daily-2027-03-01', '2027-03-14')).toBe(false)
    expect(oldDaily('daily-2027-02-20.race500', '2027-03-14')).toBe(true)
    expect(oldDaily('meadow', '2027-03-14')).toBe(false)
  })
})
