/**
 * Landscape lock while driving. Where the browser can lock the orientation (Android, installed
 * apps), it is asked to. iPhone and iPad do not let a web page lock rotation, so there, if the
 * device turns to portrait during a run, the game is turned back by 90° so it stays exactly as
 * it was in the last landscape position (the whole page is rotated with CSS, and touches are
 * mapped to match). Menus are not locked: there the "turn the device" prompt shows as before.
 */
export type Turn = 0 | 90 | -90

let lastLandscape: 90 | -90 = 90
let turn: Turn = 0

/** The device's rotation from portrait: 90 turned left (counter-clockwise), -90 turned right. */
function deviceAngle(): number {
  const w = (window as { orientation?: number }).orientation
  if (typeof w === 'number') return w
  const a = screen.orientation?.angle ?? 0
  // screen.orientation counts the other way round; 270 is -90.
  return a === 90 ? -90 : a === 270 ? 90 : a
}

const portrait = () => window.innerHeight > window.innerWidth

/** The turn applied to the page now (0 when not turned). */
export const currentTurn = (): Turn => turn

/** Call when a run starts: ask for a real lock where the browser allows one. */
export function requestLandscapeLock(): void {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    void o.lock?.('landscape').catch(() => undefined)
  } catch {
    // not supported: the CSS turn below covers it
  }
}

/**
 * Keep the page turned while driving in portrait. Call every frame with whether a run is on.
 * Returns true when the turn changed (the canvas size changes with it).
 */
export function updateLandscape(driving: boolean): boolean {
  if (!portrait()) {
    const a = deviceAngle()
    if (a === 90 || a === -90) lastLandscape = a
  }
  // Turned left (90): the game's "up" was the device's right edge, so turn the page clockwise.
  const want: Turn = driving && portrait() ? lastLandscape : 0
  if (want === turn) return false
  turn = want
  const body = document.body
  // The turned page is as wide as the screen is tall, and as tall as it is wide.
  document.documentElement.style.setProperty('--turn-w', `${window.innerHeight}px`)
  document.documentElement.style.setProperty('--turn-h', `${window.innerWidth}px`)
  body.classList.toggle('turned', turn !== 0)
  body.classList.toggle('turn-cw', turn === 90)
  body.classList.toggle('turn-ccw', turn === -90)
  return true
}

/** A touch's position along the game's own horizontal axis, and that axis's length. */
export function gameX(e: { clientX: number; clientY: number }): { x: number; width: number } {
  if (turn === 90) return { x: e.clientY, width: window.innerHeight }
  if (turn === -90) return { x: window.innerHeight - e.clientY, width: window.innerHeight }
  return { x: e.clientX, width: window.innerWidth }
}
