/**
 * Keeps the CSS variable --app-h equal to the height the game should fill.
 *
 * iOS Safari measures "100%" heights with its toolbars showing, so full-screen elements sized
 * that way stop short of the real screen when the toolbars hide or in some home-screen launches.
 * window.innerHeight is the height actually visible, so that is the base.
 *
 * Home-screen apps on iOS/iPadOS 26 have a further bug (WebKit 301108): the reported viewport can
 * be shorter than the app's window by about a status bar, leaving an empty strip at the bottom.
 * In a home-screen app the large-viewport unit (100lvh) still measures the full window, so when it
 * is a little taller than innerHeight (up to a status bar or two) the game fills that instead.
 * Call update() every frame: rotation and toolbar changes do not always fire a resize event.
 */
let last = 0
let probe: HTMLDivElement | null = null

/** True when running as a home-screen app rather than in a browser tab. */
export function standalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches
}

/** The large viewport height (100lvh), measured with a hidden element. */
function largeViewport(): number {
  if (!probe) {
    probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
  }
  return probe.offsetHeight
}

export function updateViewport(): void {
  let h = Math.round(Math.max(window.innerHeight, window.visualViewport?.height ?? 0))
  if (standalone()) {
    const lvh = largeViewport()
    if (lvh > h && lvh - h <= 90) h = lvh
  }
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

/** Numbers for the settings screen, to see what the device reports when the layout looks wrong. */
export function screenInfo(): string {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim() || '0px'
  return [
    `Fönster ${window.innerWidth}×${window.innerHeight}`,
    `skärm ${screen.width}×${screen.height}`,
    `lvh ${largeViewport()}`,
    `spelet ${last}`,
    `säkra kanter ${v('--safe-top')} ${v('--safe-right')} ${v('--safe-bottom')} ${v('--safe-left')}`,
    standalone() ? 'hemskärmsapp' : 'webbläsare',
  ].join(' · ')
}
