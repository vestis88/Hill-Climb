/**
 * Game modes. Endless: drive as far as you can. Races: a set length with a finish line, where
 * the time counts. Crashing or running dry before the line is a DNF (did not finish).
 */
export interface Mode {
  id: string
  name: string
  /** Race length in metres; absent for endless. */
  length?: number
}

export const MODES: Mode[] = [
  { id: 'endless', name: 'Endless' },
  { id: 'race500', name: '500 m', length: 500 },
  { id: 'race1000', name: '1 km', length: 1000 },
  { id: 'race2000', name: '2 km', length: 2000 },
]

export const gameMode = (id: string) => MODES.find((m) => m.id === id) ?? MODES[0]

/**
 * Key for per-track records (bests, ghosts, scores): the environment for endless, so records
 * from before races existed still count; environment and mode for races.
 */
export const recordKey = (env: string, mode: string) => (mode === 'endless' ? env : `${env}.${mode}`)

/** A race time as m:ss.t, e.g. 1:07.4. */
export function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10)
  const m = Math.floor(tenths / 600)
  const s = Math.floor((tenths % 600) / 10)
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`
}
