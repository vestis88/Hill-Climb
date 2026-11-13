import { describe, expect, it } from 'vitest'
import { drivenLevels, emptySave, setDrivenLevel } from '../src/save/save'

describe('driving at a lower level', () => {
  it('defaults to the level bought, can step down and back up, never above what was bought', () => {
    const save = emptySave()
    save.levels.runabout = { ...save.levels.runabout, engine: 12 } as never
    expect(drivenLevels(save, 'runabout').engine).toBe(12)
    setDrivenLevel(save, 'runabout', 'engine', 7)
    expect(drivenLevels(save, 'runabout').engine).toBe(7)
    setDrivenLevel(save, 'runabout', 'engine', 99)
    expect(drivenLevels(save, 'runabout').engine).toBe(12)
    expect(save.useLevels?.runabout?.engine).toBeUndefined()
    setDrivenLevel(save, 'runabout', 'engine', 0)
    expect(drivenLevels(save, 'runabout').engine).toBe(1)
    // The other upgrades are untouched.
    expect(drivenLevels(save, 'runabout').tyres).toBe(1)
  })
})
