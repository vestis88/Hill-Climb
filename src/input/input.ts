import type { Input } from '../sim/types'

export interface InputController {
  readonly input: Input
  /** Release every pedal, e.g. when a menu opens over the game. */
  reset(): void
}

/**
 * Two-pedal input. Touch: left half of the screen is brake, right half is gas,
 * and both can be held at once. Keyboard: arrow keys or A/D.
 */
export function createInput(target: HTMLElement): InputController {
  const input: Input = { gas: false, brake: false }
  const touches = new Map<number, 'gas' | 'brake'>()
  const keys = { gas: false, brake: false }

  const refresh = () => {
    const sides = [...touches.values()]
    input.gas = keys.gas || sides.includes('gas')
    input.brake = keys.brake || sides.includes('brake')
  }
  const reset = () => {
    touches.clear()
    keys.gas = keys.brake = false
    refresh()
  }

  const down = (e: PointerEvent) => {
    e.preventDefault()
    touches.set(e.pointerId, e.clientX >= window.innerWidth / 2 ? 'gas' : 'brake')
    refresh()
  }
  const up = (e: PointerEvent) => {
    touches.delete(e.pointerId)
    refresh()
  }
  target.addEventListener('pointerdown', down)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
  target.addEventListener('pointerleave', up)
  // Stop Safari scrolling, zooming and showing the long-press menu over the game.
  // Only on the game itself, so menu buttons still get normal taps.
  for (const type of ['touchstart', 'touchmove', 'contextmenu']) {
    target.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  }
  for (const type of ['gesturestart', 'dblclick']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  }

  const key = (pressed: boolean) => (e: KeyboardEvent) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.gas = pressed
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.brake = pressed
    else return
    e.preventDefault()
    refresh()
  }
  window.addEventListener('keydown', key(true))
  window.addEventListener('keyup', key(false))
  window.addEventListener('blur', reset)

  return { input, reset }
}
