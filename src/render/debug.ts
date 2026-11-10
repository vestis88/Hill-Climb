import type { Environment } from '../data/environments'
import type { Pickup } from '../data/track'
import type { HeightFn, Input, Pose, SimState, VehicleSpec } from '../sim/types'

/** Metres of world visible across the screen width. */
const VIEW_WIDTH = 26

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  angle: lerp(a.angle, b.angle, t),
})

/** A short message that rises and fades: "+25", "Flip! +50". */
export interface Popup {
  text: string
  /** World position, or undefined for a message in the middle of the screen. */
  at?: { x: number; y: number }
  age: number
}

export interface View {
  prev: SimState
  next: SimState
  /** How far between prev and next to draw, 0..1. */
  alpha: number
  spec: VehicleSpec
  height: HeightFn
  palette: Environment['palette']
  input: Input
  pickups: Pickup[]
  /** Fuel left, 0..1. */
  fuel: number
  runCoins: number
  popups: Popup[]
  showPedals: boolean
  /** Distance, fuel and coin counter; hidden behind full-screen menus. */
  showHud: boolean
}

const FONT = '-apple-system, system-ui, sans-serif'

/**
 * Plain shapes renderer. Task G1 replaces it with real art; keep it working as a debug view.
 */
export class DebugRenderer {
  private readonly ctx: CanvasRenderingContext2D
  private camX = 0
  private camY = 0
  private width = 0
  private height = 0
  /** Safe-area insets (notch, home bar, rounded corners), CSS pixels. */
  private safe = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = this.canvas.clientWidth
    this.height = this.canvas.clientHeight
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(document.documentElement)
    const inset = (name: string) => parseFloat(css.getPropertyValue(name)) || 0
    this.safe = {
      top: inset('--safe-top'),
      right: inset('--safe-right'),
      bottom: inset('--safe-bottom'),
      left: inset('--safe-left'),
    }
  }

  /** Snap the camera to the car, e.g. at the start of a run. */
  resetCamera(state: SimState): void {
    this.camX = state.chassis.x + VIEW_WIDTH * 0.22
    this.camY = state.chassis.y + 1
  }

  draw(view: View): void {
    // iOS can change the canvas's on-screen size (rotation, home-screen launch) without a
    // usable resize event; a stale backing size stretches the picture, so check every frame.
    if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) this.resize()
    const { ctx, width, height: h } = this
    const { prev, next, alpha, spec, height } = view
    const chassis = lerpPose(prev.chassis, next.chassis, alpha)
    const scale = width / VIEW_WIDTH

    // Camera sits ahead of the car so more of the road ahead is visible.
    this.camX = chassis.x + VIEW_WIDTH * 0.22
    this.camY = lerp(this.camY, chassis.y + 1, 0.18)

    const pal = view.palette
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, pal.skyTop)
    sky.addColorStop(1, pal.skyBottom)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, h)

    ctx.save()
    ctx.translate(width / 2, h * 0.58)
    ctx.scale(scale, -scale)
    ctx.translate(-this.camX, -this.camY)

    // Ground
    const left = this.camX - VIEW_WIDTH / 2 - 1
    const right = this.camX + VIEW_WIDTH / 2 + 1
    const bottom = this.camY - (h / scale) * 0.6
    ctx.beginPath()
    ctx.moveTo(left, bottom)
    for (let x = left; x <= right; x += 0.25) ctx.lineTo(x, height(x))
    ctx.lineTo(right, bottom)
    ctx.closePath()
    ctx.fillStyle = pal.ground
    ctx.fill()
    ctx.beginPath()
    for (let x = left; x <= right; x += 0.25) ctx.lineTo(x, height(x))
    ctx.lineWidth = 0.22
    ctx.strokeStyle = pal.surface
    ctx.stroke()

    // Distance markers every 50 m
    for (let x = Math.ceil(left / 50) * 50; x <= right; x += 50) {
      if (x <= 0) continue
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - 0.05, height(x), 0.1, 2.2)
      ctx.fillRect(x - 0.05, height(x) + 1.7, 1.3, 0.55)
      ctx.save()
      ctx.translate(x + 0.65, height(x) + 1.97)
      ctx.scale(1, -1)
      ctx.fillStyle = '#10151c'
      ctx.font = `700 0.42px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${x}`, 0, 0)
      ctx.restore()
    }

    // Pickups
    view.pickups.forEach((p) => {
      if (p.taken || p.x < left || p.x > right) return
      if (p.kind === 'coin') {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 0.32, 0, Math.PI * 2)
        ctx.fillStyle = p.value >= 25 ? '#ffb020' : '#ffd23f'
        ctx.fill()
        ctx.lineWidth = 0.07
        ctx.strokeStyle = '#c98a00'
        ctx.stroke()
      } else {
        ctx.fillStyle = '#d7263d'
        ctx.beginPath()
        ctx.roundRect(p.x - 0.35, p.y - 0.45, 0.7, 0.9, 0.1)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(p.x - 0.18, p.y - 0.05, 0.36, 0.12)
        ctx.fillStyle = '#333'
        ctx.fillRect(p.x - 0.1, p.y + 0.45, 0.2, 0.15)
      }
    })

    // Wheels
    next.wheels.forEach((_, i) => {
      const w = lerpPose(prev.wheels[i], next.wheels[i], alpha)
      const r = spec.wheels[i].radius
      ctx.save()
      ctx.translate(w.x, w.y)
      ctx.rotate(w.angle)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = '#22262b'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = '#c9ced6'
      ctx.fill()
      ctx.fillStyle = '#22262b'
      ctx.fillRect(-r * 0.5, -0.04, r, 0.08)
      ctx.restore()
    })

    // Chassis and driver
    ctx.save()
    ctx.translate(chassis.x, chassis.y)
    ctx.rotate(chassis.angle)
    const { head, headRadius } = spec.driver
    ctx.strokeStyle = '#2b3a55'
    ctx.lineWidth = 0.16
    ctx.beginPath()
    ctx.moveTo(head.x, 0.35)
    ctx.lineTo(head.x, head.y - headRadius)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2)
    ctx.fillStyle = '#2f80ed'
    ctx.fill()
    ctx.fillStyle = '#f2f6fb'
    ctx.fillRect(head.x + headRadius * 0.1, head.y - headRadius * 0.15, headRadius * 0.85, headRadius * 0.45)
    ctx.beginPath()
    spec.chassis.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fillStyle = '#e2542f'
    ctx.fill()
    ctx.restore()

    // Pop-ups attached to the world
    for (const p of view.popups) {
      if (!p.at) continue
      ctx.save()
      ctx.translate(p.at.x, p.at.y + 0.6 + p.age * 1.5)
      ctx.scale(1, -1)
      ctx.globalAlpha = Math.max(0, 1 - p.age / 0.9)
      ctx.font = `800 0.55px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff3b0'
      ctx.strokeStyle = '#7a5200'
      ctx.lineWidth = 0.08
      ctx.strokeText(p.text, 0, 0)
      ctx.fillText(p.text, 0, 0)
      ctx.restore()
    }

    ctx.restore()
    if (view.showHud) this.drawHud(view)
  }

  private drawHud(view: View): void {
    const { ctx, width, height: h, safe } = this
    const x0 = Math.max(16, safe.left)
    const y0 = Math.max(12, safe.top)

    // Distance
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.font = `800 18px ${FONT}`
    ctx.lineWidth = 4
    ctx.strokeStyle = '#10151c'
    ctx.fillStyle = '#ffffff'
    ctx.strokeText(`${Math.floor(view.next.distance)} m`, x0, y0)
    ctx.fillText(`${Math.floor(view.next.distance)} m`, x0, y0)

    // Fuel gauge
    const gw = 130
    const gy = y0 + 26
    ctx.fillStyle = 'rgba(16, 21, 28, 0.35)'
    ctx.beginPath()
    ctx.roundRect(x0, gy, gw, 14, 7)
    ctx.fill()
    const low = view.fuel < 0.25
    ctx.fillStyle = low ? '#e5383b' : '#3fbf5f'
    if (view.fuel > 0) {
      ctx.beginPath()
      ctx.roundRect(x0 + 2, gy + 2, (gw - 4) * view.fuel, 10, 5)
      ctx.fill()
    }
    ctx.font = `700 11px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('FUEL', x0 + 6, gy + 2)
    if (low && Math.floor(performance.now() / 300) % 2 === 0) {
      ctx.fillStyle = '#e5383b'
      ctx.font = `800 15px ${FONT}`
      ctx.fillText(view.fuel <= 0 ? 'OUT OF FUEL' : 'LOW FUEL', x0, gy + 20)
    }

    // Coins this run
    ctx.textAlign = 'center'
    ctx.font = `800 24px ${FONT}`
    ctx.fillStyle = '#ffd23f'
    ctx.strokeStyle = '#7a5200'
    ctx.lineWidth = 4
    const coinText = `● ${view.runCoins}`
    ctx.strokeText(coinText, width / 2, y0)
    ctx.fillText(coinText, width / 2, y0)

    // Stunt and milestone pop-ups
    let row = 0
    for (const p of view.popups) {
      if (p.at) continue
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.6 - p.age) / 0.4))
      ctx.font = `800 26px ${FONT}`
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#10151c'
      ctx.lineWidth = 5
      const y = h * 0.22 + row * 34 - p.age * 10
      ctx.strokeText(p.text, width / 2, y)
      ctx.fillText(p.text, width / 2, y)
      ctx.globalAlpha = 1
      row++
    }

    // Pedal hints
    if (!view.showPedals) return
    const pad = (x: number, label: string, active: boolean) => {
      ctx.globalAlpha = active ? 0.55 : 0.22
      ctx.fillStyle = '#10151c'
      ctx.beginPath()
      ctx.roundRect(x, padY, 120, 72, 14)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 16px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + 60, padY + 36)
    }
    const padY = h - 96 - safe.bottom
    pad(Math.max(24, safe.left), 'BRAKE', view.input.brake)
    pad(width - 144 - Math.max(0, safe.right - 24), 'GAS', view.input.gas)
    ctx.textBaseline = 'top'
  }
}
