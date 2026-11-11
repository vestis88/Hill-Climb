/**
 * Keeps the CSS variable --app-h equal to the visible screen height.
 *
 * iOS Safari measures "100%" heights with its toolbars showing, so full-screen elements sized
 * that way stop short of the real screen when the toolbars hide or in some home-screen launches.
 * window.innerHeight is the height actually visible. Call update() every frame: rotation and
 * toolbar changes do not always fire a resize event.
 */
let last = 0

export function updateViewport(): void {
  const h = Math.round(Math.max(window.innerHeight, window.visualViewport?.height ?? 0))
  if (h === last || h <= 0) return
  last = h
  document.documentElement.style.setProperty('--app-h', `${h}px`)
}

export function trackViewport(): void {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.addEventListener('orientationchange', () => setTimeout(updateViewport, 250))
}
