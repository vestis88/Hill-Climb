import type { HeightFn, Input, Pose, SimState, VehicleSpec } from '../sim/types'

/** Metres of world visible across the screen width. */
const VIEW_WIDTH = 26

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  angle: lerp(a.angle, b.angle, t),
})

/**
 * Plain shapes renderer for the physics prototype. Task G1 replaces it;
 * keep it working as a debug view.
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

  draw(prev: SimState, next: SimState, alpha: number, spec: VehicleSpec, height: HeightFn, input: Input): void {
    // iOS can change the canvas's on-screen size (rotation, home-screen launch) without a
    // usable resize event; a stale backing size stretches the picture, so check every frame.
    if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) this.resize()
    const { ctx, width, height: h } = this
    const chassis = lerpPose(prev.chassis, next.chassis, alpha)
    const scale = width / VIEW_WIDTH

    // Camera sits ahead of the car so more of the road ahead is visible.
    const targetX = chassis.x + VIEW_WIDTH * 0.22
    const targetY = chassis.y + 1
    this.camX = targetX
    this.camY = lerp(this.camY, targetY, 0.18)

    ctx.fillStyle = '#7fb6e6'
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
    ctx.fillStyle = '#6b4a2f'
    ctx.fill()
    ctx.beginPath()
    for (let x = left; x <= right; x += 0.25) ctx.lineTo(x, height(x))
    ctx.lineWidth = 0.22
    ctx.strokeStyle = '#4c9a3d'
    ctx.stroke()

    // Distance markers every 10 m
    ctx.fillStyle = '#ffffff'
    for (let x = Math.ceil(left / 10) * 10; x <= right; x += 10) ctx.fillRect(x - 0.04, height(x), 0.08, 0.8)

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

    // Chassis
    ctx.save()
    ctx.translate(chassis.x, chassis.y)
    ctx.rotate(chassis.angle)
    ctx.beginPath()
    spec.chassis.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fillStyle = '#e2542f'
    ctx.fill()
    ctx.restore()

    ctx.restore()

    // HUD
    ctx.fillStyle = '#10151c'
    ctx.font = '600 16px -apple-system, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    const { safe } = this
    const hudX = Math.max(16, safe.left)
    const hudY = Math.max(14, safe.top)
    ctx.fillText(`${Math.floor(next.distance)} m`, hudX, hudY)
    ctx.fillText(`${Math.round(Math.abs(next.speed) * 3.6)} km/h`, hudX, hudY + 22)

    // Pedal hints
    const pad = (x: number, label: string, active: boolean) => {
      ctx.globalAlpha = active ? 0.55 : 0.22
      ctx.fillStyle = '#10151c'
      ctx.beginPath()
      ctx.roundRect(x, padY, 120, 72, 14)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.fillText(label, x + 60, padY + 28)
      ctx.textAlign = 'left'
    }
    const padY = h - 96 - safe.bottom
    pad(Math.max(24, safe.left), 'BRAKE', input.brake)
    pad(width - 144 - Math.max(0, safe.right - 24), 'GAS', input.gas)
  }
}
