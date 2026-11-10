import type { Input } from '../sim/types'

/**
 * Two-pedal input. Touch: left half of the screen is brake, right half is gas,
 * and both can be held at once. Keyboard: arrow keys or A/D.
 */
export function createInput(target: HTMLElement): Input {
  const input: Input = { gas: false, brake: false }
  const touches = new Map<number, 'gas' | 'brake'>()
  const keys = { gas: false, brake: false }

  const refresh = () => {
    const sides = [...touches.values()]
    input.gas = keys.gas || sides.includes('gas')
    input.brake = keys.brake || sides.includes('brake')
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
  // Stop Safari scrolling, zooming and showing the long-press menu.
  for (const type of ['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'dblclick']) {
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
  window.addEventListener('blur', () => {
    touches.clear()
    keys.gas = keys.brake = false
    refresh()
  })

  return input
}
