import type { Environment } from '../data/environments'
import type { Pickup } from '../data/track'
import type { HeightFn, Input, Pose, SimState, VehicleSpec } from '../sim/types'
import { drawHead, drawPickup, drawVehicle, drawWheel, OUTLINE } from './art'
import { Particles } from './particles'
import { drawBackdrop, drawGround, drawWeather } from './scenery'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  angle: lerp(a.angle, b.angle, t),
})

/** A short message that rises and fades: "+5", "Flip! +50". */
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
  /** Real seconds since the last frame, for animation. */
  dt: number
  spec: VehicleSpec
  height: HeightFn
  env: Environment
  input: Input
  pickups: Pickup[]
  /** Fuel left, 0..1. */
  fuel: number
  runCoins: number
  popups: Popup[]
  showPedals: boolean
  /** Distance, fuel and coin counter; hidden behind full-screen menus. */
  showHud: boolean
  /** Driver lean while driving, or the ragdoll's body parts after a crash. */
  driver: { lean: number; ragdoll: { torso: Pose; head: Pose } | null }
}

const FONT = '-apple-system, system-ui, sans-serif'

/** Draws the game. Visual only: it reads simulation state and never changes it. */
export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D
  readonly particles = new Particles()
  private camX = 0
  private camY = 0
  private viewWidth = 24
  private width = 0
  private height = 0
  private time = 0
  private wasAirborne = false
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
    this.safe = { top: inset('--safe-top'), right: inset('--safe-right'), bottom: inset('--safe-bottom'), left: inset('--safe-left') }
  }

  /** Snap the camera to the car and clear effects, e.g. at the start of a run. */
  resetCamera(state: SimState): void {
    this.viewWidth = 24
    this.camX = state.chassis.x + this.viewWidth * 0.2
    this.camY = state.chassis.y + 1
    this.particles.clear()
  }

  /** A burst of sparkles, e.g. where a coin was picked up. */
  sparkle(x: number, y: number, colour = '#ffe58a'): void {
    this.particles.emit(x, y, { count: 8, speed: 3, colour, size: 0.08, life: 0.5, gravity: 0 })
  }

  draw(view: View): void {
    // iOS can change the canvas's on-screen size without a usable resize event;
    // a stale backing size stretches the picture, so check every frame.
    if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) this.resize()
    const { ctx, width, height: h } = this
    const { prev, next, alpha, height, env } = view
    this.time += view.dt
    const chassis = lerpPose(prev.chassis, next.chassis, alpha)

    // Camera: looks ahead, and pulls back as speed builds.
    const speed = Math.abs(next.speed)
    this.viewWidth = lerp(this.viewWidth, Math.min(34, 22 + speed * 0.55), 0.03)
    const scale = width / this.viewWidth
    this.camX = chassis.x + this.viewWidth * 0.2
    this.camY = lerp(this.camY, chassis.y + 1, 0.18)

    drawBackdrop(ctx, env, width, h, this.camX, this.time)

    ctx.save()
    ctx.translate(width / 2, h * 0.58)
    ctx.scale(scale, -scale)
    ctx.translate(-this.camX, -this.camY)
    const left = this.camX - this.viewWidth / 2 - 1
    const right = this.camX + this.viewWidth / 2 + 1
    const bottom = this.camY - (h / scale) * 0.6

    drawGround(ctx, env, height, left, right, bottom)
    this.drawSigns(height, left, right)
    for (const p of view.pickups) if (!p.taken && p.x > left - 1 && p.x < right + 1) drawPickup(ctx, p, this.time)

    this.effects(view, chassis)
    this.drawVehicle(view, chassis)
    this.particles.update(view.dt)
    this.particles.draw(ctx)
    this.drawWorldPopups(view)
    ctx.restore()

    drawWeather(ctx, env, width, h, this.camX, this.time)
    if (view.showHud) this.drawHud(view)
  }

  private drawSigns(height: HeightFn, left: number, right: number): void {
    const { ctx } = this
    for (let x = Math.ceil(left / 50) * 50; x <= right; x += 50) {
      if (x <= 0) continue
      const y = height(x)
      ctx.fillStyle = '#8a5a33'
      ctx.fillRect(x - 0.06, y, 0.12, 2.1)
      ctx.beginPath()
      ctx.roundRect(x - 0.7, y + 1.6, 1.4, 0.65, 0.12)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = 0.05
      ctx.strokeStyle = OUTLINE
      ctx.stroke()
      ctx.save()
      ctx.translate(x, y + 1.93)
      ctx.scale(1, -1)
      ctx.fillStyle = OUTLINE
      ctx.font = `800 0.42px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${x} m`, 0, 0)
      ctx.restore()
    }
  }

  /** Dust from spinning wheels and puffs on landing. */
  private effects(view: View, chassis: Pose): void {
    const { next, spec, env } = view
    const dust = env.id === 'frost' ? '#ffffff' : env.id === 'crater' ? '#b7b8c2' : '#b08a62'
    next.wheels.forEach((w, i) => {
      if (!next.wheelContacts[i]) return
      const r = spec.wheels[i].radius
      const driven = spec.wheels[i].axle === 'rear' || spec.engine.frontShare > 0
      if (driven && view.input.gas && Math.random() < 0.35) {
        this.particles.emit(w.x - r * 0.6, w.y - r * 0.8, { count: 1, speed: 1.5, colour: dust, size: 0.12, life: 0.6, dir: Math.PI * 0.85, up: 0.4 })
      }
    })
    if (this.wasAirborne && !next.airborne) {
      for (const w of next.wheels) this.particles.emit(w.x, w.y - 0.4, { count: 6, speed: 2.2, colour: dust, size: 0.16, life: 0.7, up: 0.3 })
    }
    this.wasAirborne = next.airborne
    void chassis
  }

  private drawVehicle(view: View, chassis: Pose): void {
    const { ctx } = this
    const { prev, next, alpha, spec } = view
    const rag = view.driver.ragdoll
    const toWorld = (x: number, y: number) => {
      const c = Math.cos(chassis.angle)
      const s = Math.sin(chassis.angle)
      return { x: chassis.x + x * c - y * s, y: chassis.y + x * s + y * c }
    }
    // Suspension struts, behind the wheels and body.
    next.wheels.forEach((_, i) => {
      const w = lerpPose(prev.wheels[i], next.wheels[i], alpha)
      const top = toWorld(spec.wheels[i].anchor.x, spec.wheels[i].anchor.y + 0.45)
      ctx.lineCap = 'round'
      for (const [lw, col] of [[0.16, OUTLINE], [0.1, '#8b93a1']] as const) {
        ctx.beginPath()
        ctx.moveTo(top.x, top.y)
        ctx.lineTo(w.x, w.y)
        ctx.lineWidth = lw
        ctx.strokeStyle = col
        ctx.stroke()
      }
    })
    if (rag) this.drawRagdollBody(rag.torso)
    next.wheels.forEach((_, i) => {
      const w = lerpPose(prev.wheels[i], next.wheels[i], alpha)
      ctx.save()
      ctx.translate(w.x, w.y)
      ctx.rotate(w.angle)
      drawWheel(ctx, spec.wheels[i].radius)
      ctx.restore()
    })
    ctx.save()
    ctx.translate(chassis.x, chassis.y)
    ctx.rotate(chassis.angle)
    drawVehicle(ctx, spec, view.driver.lean, !rag)
    ctx.restore()
    if (rag) {
      ctx.save()
      ctx.translate(rag.head.x, rag.head.y)
      ctx.rotate(rag.head.angle)
      drawHead(ctx, spec.driver.headRadius)
      ctx.restore()
    }
  }

  private drawRagdollBody(torso: Pose): void {
    const { ctx } = this
    ctx.save()
    ctx.translate(torso.x, torso.y)
    ctx.rotate(torso.angle)
    ctx.lineCap = 'round'
    for (const [lw, col] of [[0.36, OUTLINE], [0.26, '#24365c']] as const) {
      ctx.beginPath()
      ctx.moveTo(0, -0.3)
      ctx.lineTo(0, 0.3)
      ctx.lineWidth = lw
      ctx.strokeStyle = col
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawWorldPopups(view: View): void {
    const { ctx } = this
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
  }

  private outlinedText(text: string, x: number, y: number, size: number, fill = '#ffffff'): void {
    const { ctx } = this
    ctx.font = `800 ${size}px ${FONT}`
    ctx.lineJoin = 'round'
    ctx.lineWidth = size * 0.22
    ctx.strokeStyle = OUTLINE
    ctx.strokeText(text, x, y)
    ctx.fillStyle = fill
    ctx.fillText(text, x, y)
  }

  private drawHud(view: View): void {
    const { ctx, width, height: h, safe } = this
    const x0 = Math.max(16, safe.left)
    const y0 = Math.max(12, safe.top)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    this.outlinedText(`${Math.floor(view.next.distance)} m`, x0, y0, 20)

    // Fuel gauge with a small can icon
    const gx = x0 + 22
    const gy = y0 + 30
    const gw = 120
    ctx.fillStyle = '#e5383b'
    ctx.beginPath()
    ctx.roundRect(x0, gy - 1, 16, 18, 3)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(gx, gy, gw, 16, 8)
    ctx.fillStyle = 'rgba(16, 21, 28, 0.45)'
    ctx.fill()
    ctx.stroke()
    const low = view.fuel < 0.25
    if (view.fuel > 0) {
      ctx.beginPath()
      ctx.roundRect(gx + 2, gy + 2, (gw - 4) * view.fuel, 12, 6)
      ctx.fillStyle = low ? '#e5383b' : view.fuel < 0.5 ? '#ffb020' : '#3fbf5f'
      ctx.fill()
    }
    if (low && Math.floor(this.time / 0.3) % 2 === 0) this.outlinedText(view.fuel <= 0 ? 'OUT OF FUEL' : 'LOW FUEL', x0, gy + 22, 15, '#ff6b6b')

    // Coins this run, in a pill at the top centre
    ctx.textAlign = 'center'
    const text = `${view.runCoins}`
    ctx.font = `800 22px ${FONT}`
    const tw = ctx.measureText(text).width
    const pw = tw + 48
    ctx.beginPath()
    ctx.roundRect(width / 2 - pw / 2, y0 - 4, pw, 32, 16)
    ctx.fillStyle = 'rgba(16, 21, 28, 0.45)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(width / 2 - pw / 2 + 18, y0 + 12, 9, 0, Math.PI * 2)
    ctx.fillStyle = '#ffcf33'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#c98a00'
    ctx.stroke()
    this.outlinedText(text, width / 2 + 10, y0, 22, '#ffd23f')

    // Stunt and milestone pop-ups
    let row = 0
    for (const p of view.popups) {
      if (p.at) continue
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.6 - p.age) / 0.4))
      this.outlinedText(p.text, width / 2, h * 0.2 + row * 34 - p.age * 10, 26)
      ctx.globalAlpha = 1
      row++
    }

    if (view.showPedals) this.drawPedals(view.input)
  }

  private drawPedals(input: Input): void {
    const { ctx, width, height: h, safe } = this
    const pw = 96
    const ph = 110
    const y = h - ph - 16 - safe.bottom
    const pedal = (x: number, active: boolean, colour: string, label: string) => {
      ctx.save()
      ctx.translate(x + pw / 2, y + ph / 2)
      if (active) ctx.scale(0.94, 0.94)
      ctx.globalAlpha = active ? 0.75 : 0.4
      ctx.beginPath()
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 18)
      ctx.fillStyle = '#2a2f38'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = OUTLINE
      ctx.stroke()
      ctx.fillStyle = '#3d4450'
      for (let i = -2; i <= 2; i++) ctx.fillRect(-pw / 2 + 14, i * 16 - 3, pw - 28, 6)
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      this.outlinedText(label, 0, ph / 2 - 16, 14, colour)
      ctx.restore()
    }
    pedal(Math.max(20, safe.left), input.brake, '#ff8080', 'BRAKE')
    pedal(width - pw - Math.max(20, safe.right), input.gas, '#7dff9a', 'GAS')
    ctx.textBaseline = 'top'
  }
}
