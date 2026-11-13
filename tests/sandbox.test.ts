import { describe, expect, it } from 'vitest'
import { FULL_LEVELS, applyUpgrades, BASE_LEVELS } from '../src/data/upgrades'
import { VEHICLES, vehicleEntry } from '../src/data/vehicles'
import { defaultSandbox, field, FIELDS, isCustom, sandboxSpec, setAllLevels, setCustom, setLevel, upgradedOnly } from '../src/game/sandbox'

describe('Trimning sandbox', () => {
  it('with nothing changed, a vehicle is exactly its upgraded self', () => {
    const s = defaultSandbox()
    for (const v of VEHICLES) {
      expect(sandboxSpec(s, v.id)).toEqual(applyUpgrades(v.base, v.full, BASE_LEVELS))
      setAllLevels(s, v.id, FULL_LEVELS)
      expect(sandboxSpec(s, v.id)).toEqual(applyUpgrades(v.base, v.full, FULL_LEVELS))
    }
  })

  it('upgrade sliders move the handling values live; own levels are the starting point', () => {
    const s = defaultSandbox()
    const own = { ...BASE_LEVELS, engine: 6 }
    const v = vehicleEntry('runabout')
    expect(sandboxSpec(s, 'runabout', own).engine.maxTorque).toBeCloseTo(applyUpgrades(v.base, v.full, own).engine.maxTorque)
    setLevel(s, 'runabout', 'engine', 10, own)
    expect(sandboxSpec(s, 'runabout', own).engine.maxTorque).toBeCloseTo(v.full.engine.maxTorque)
  })

  it('a value set by hand makes it custom, wins over the levels, and setting it back undoes it', () => {
    const s = defaultSandbox()
    setCustom(s, 'hauler', 'maxTorque', 55)
    expect(isCustom(s, 'hauler')).toBe(true)
    setLevel(s, 'hauler', 'engine', 10)
    expect(sandboxSpec(s, 'hauler').engine.maxTorque).toBe(55)
    setCustom(s, 'hauler', 'maxTorque', upgradedOnly(s, 'hauler').engine.maxTorque)
    expect(isCustom(s, 'hauler')).toBe(false)
  })

  it('wheel values keep the difference between front and back wheels', () => {
    const s = defaultSandbox()
    for (const v of VEHICLES) {
      const before = upgradedOnly(s, v.id).wheels.map((w) => w.friction)
      setCustom(s, v.id, 'friction', before[0] * 2)
      const after = sandboxSpec(s, v.id).wheels.map((w) => w.friction)
      after.forEach((f, i) => expect(f).toBeCloseTo(before[i] * 2))
    }
  })

  it('every-vehicle factors scale each vehicle from its own value', () => {
    const s = defaultSandbox()
    s.factors = { mass: 1.5, spinRate: 0.5 }
    for (const v of VEHICLES) {
      const plain = upgradedOnly(s, v.id)
      const spec = sandboxSpec(s, v.id)
      expect(spec.chassis.mass).toBeCloseTo(plain.chassis.mass * 1.5)
      expect(spec.airControl.spinRate).toBeCloseTo(plain.airControl.spinRate * 0.5)
    }
  })

  it('never changes the shared vehicle data', () => {
    const s = defaultSandbox()
    const before = JSON.stringify(VEHICLES)
    for (const f of FIELDS) setCustom(s, 'monster', f.key, f.max)
    s.factors = { maxTorque: 2 }
    sandboxSpec(s, 'monster')
    expect(JSON.stringify(VEHICLES)).toBe(before)
    expect(field('maxTorque')).toBeDefined()
  })
})
