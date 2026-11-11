import type { Environment } from '../data/environments'
import type { Pickup } from '../data/track'
import type { HeightFn, Input, Pose, SimState, VehicleSpec } from '../sim/types'
import type { GhostPose } from '../save/ghosts'
import { formatTime } from '../data/modes'
import { drawHead, drawnHubs, drawPickup, drawVehicle, drawWheel, EXHAUST, OUTLINE, type Mood } from './art'
import { Particles } from './particles'
import { drawBackdrop, drawForeground, drawGround, drawProps, drawWeather, themeFor } from './scenery'

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
  /** Gas pedal on the left instead of the right. */
  swapPedals: boolean
  /** Distance, fuel and coin counter; hidden behind full-screen menus. */
  showHud: boolean
  /** Driver lean while driving, or the ragdoll's body parts after a crash. */
  driver: { lean: number; ragdoll: { torso: Pose; head: Pose } | null }
  /** Whose turn it is, shown by the distance. */
  player?: { name: string; colour: string }
  /** Race mode: the length (the finish line's distance from the start) and the clock, seconds. */
  race?: { length: number; time: number }
  /** Ghost riders to race: a recorded pose, its vehicle and a name tag. */
  ghosts: { label: string; colour: string; spec: VehicleSpec; pose: GhostPose }[]
}

const FONT = "ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif"

/** Mud, dust or snow on the tyres, per environment. */
const GRIME: Record<string, string> = { meadow: 'rgba(110, 76, 44, 0.9)', crater: 'rgba(190, 190, 200, 0.85)', frost: 'rgba(255, 255, 255, 0.95)' }

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
  /** Seconds since the last gear change, which way it went, and a backfire waiting to be drawn. */
  private shiftT = 9
  private shiftUp = true
  private backfire = false
  /** Needle position of the rev gauge, eased. */
  private needle = 0
  private wasAirborne = false
  private shakeAmount = 0
  private toScreen = (x: number, y: number) => ({ x, y })
  /** Coins flying from where they were picked up to the counter, and the counter's pop. */
  private flying: { x: number; y: number; t: number }[] = []
  private counterPop = 0
  private vignette: CanvasGradient | null = null
  private vignetteSize = ''
  /** Seconds left of Pip's grin after a stunt or bonus. */
  private cheerTime = 0
  private airTime = 0
  /** Safe-area insets (notch, home bar, rounded corners), CSS pixels. */
  private safe = { top: 0, right: 0, bottom: 0, left: 0 }
  /** Highest pixel density to draw at; lowered automatically if frames run slow. */
  private maxDpr = 2
  private slowFrames = 0
  private avgDt = 1 / 60

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr)
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

  /** Make Pip grin for a moment, e.g. after a flip or a bonus. */
  cheer(seconds = 1.5): void {
    this.cheerTime = Math.max(this.cheerTime, seconds)
  }

  /** Shake the view, e.g. on a hard landing or a crash. Strength 0..1. */
  shake(strength: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, Math.min(1, strength))
  }

  /**
   * A gear change: the gear number pops on the rev gauge, the rider rocks back on the way up,
   * and the exhaust spits a puff and a flash of flame. Visual only.
   */
  gearShift(up: boolean): void {
    this.shiftT = 0
    this.shiftUp = up
    if (up) this.backfire = true
  }

  /** A collected coin flies up to the counter (world position). */
  coinCollected(x: number, y: number): void {
    const p = this.toScreen(x, y)
    this.flying.push({ x: p.x, y: p.y, t: 0 })
  }

  private drawFlyingCoins(dt: number): void {
    const { ctx, width } = this
    const tx = width / 2 - 30
    const ty = Math.max(12, this.safe.top) + 12
    this.counterPop = Math.max(0, this.counterPop - dt * 4)
    for (const c of this.flying) {
      c.t += dt / 0.55
      const t = Math.min(1, c.t)
      const e = t * t * (3 - 2 * t)
      const x = c.x + (tx - c.x) * e
      const y = c.y + (ty - c.y) * e - Math.sin(t * Math.PI) * 60
      const r = 9 * (1 - 0.3 * t)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffcf33'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#c98a00'
      ctx.stroke()
      if (c.t >= 1) this.counterPop = 1
    }
    this.flying = this.flying.filter((c) => c.t < 1)
  }

  /** White streaks rushing past when going fast. */
  private drawSpeedLines(view: View): void {
    const speed = Math.abs(view.next.speed)
    const k = Math.min(1, Math.max(0, (speed - 14) / 8))
    if (k <= 0 || !view.showPedals) return
    const { ctx, width, height: h } = this
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * k})`
    ctx.lineCap = 'round'
    for (let i = 0; i < 14; i++) {
      const y = h * (0.1 + 0.8 * ((i * 0.6180339) % 1))
      const len = width * (0.08 + 0.1 * ((i * 0.37) % 1)) * k
      const x = width - ((this.time * (900 + 300 * ((i * 0.53) % 1)) + i * 211) % (width + len * 2)) + len
      ctx.lineWidth = 1.5 + (i % 3)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
    }
  }

  /** A soft darkening towards the corners that frames the action. */
  private drawVignette(): void {
    const { ctx, width, height: h } = this
    const key = `${width}x${h}`
    if (!this.vignette || this.vignetteSize !== key) {
      const g = ctx.createRadialGradient(width / 2, h / 2, Math.min(width, h) * 0.45, width / 2, h / 2, Math.hypot(width, h) * 0.6)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(10, 15, 30, 0.28)')
      this.vignette = g
      this.vignetteSize = key
    }
    ctx.fillStyle = this.vignette
    ctx.fillRect(0, 0, width, h)
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
    this.shiftT += view.dt
    this.adaptResolution(view.dt)
    const chassis = lerpPose(prev.chassis, next.chassis, alpha)

    // Camera: looks ahead, and pulls back as speed builds.
    const speed = Math.abs(next.speed)
    this.viewWidth = lerp(this.viewWidth, Math.min(34, 22 + speed * 0.55), 0.03)
    const scale = width / this.viewWidth
    this.camX = chassis.x + this.viewWidth * 0.2
    this.camY = lerp(this.camY, chassis.y + 1, 0.18)

    drawBackdrop(ctx, env, width, h, this.camX, this.camY, this.time)

    ctx.save()
    if (this.shakeAmount > 0.01) {
      const k = this.shakeAmount * 6
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k)
      this.shakeAmount *= Math.pow(0.02, view.dt)
    }
    ctx.translate(width / 2, h * 0.58)
    ctx.scale(scale, -scale)
    ctx.translate(-this.camX, -this.camY)
    this.toScreen = (x: number, y: number) => ({ x: width / 2 + (x - this.camX) * scale, y: h * 0.58 - (y - this.camY) * scale })
    const left = this.camX - this.viewWidth / 2 - 1
    const right = this.camX + this.viewWidth / 2 + 1
    const bottom = this.camY - (h / scale) * 0.6

    drawProps(ctx, env, height, left, right)
    drawGround(ctx, env, height, left, right, bottom, this.camY + this.viewWidth, this.time)
    this.drawSigns(height, left, right)
    if (view.race && view.race.length > left - 3 && view.race.length < right + 3) this.drawFinish(height, view.race.length)
    this.drawShadow(view, chassis)
    for (const p of view.pickups) if (!p.taken && p.x > left - 1 && p.x < right + 1) drawPickup(ctx, p, this.time)

    this.effects(view, chassis)
    this.drawGhosts(view)
    this.drawVehicle(view, chassis)
    this.particles.update(view.dt)
    this.particles.draw(ctx)
    this.drawWorldPopups(view)
    ctx.restore()

    drawForeground(ctx, env, width, h, this.camX, this.time)
    drawWeather(ctx, env, width, h, this.camX, this.time)
    this.drawSpeedLines(view)
    this.drawVignette()
    if (view.showHud) this.drawHud(view)
    this.drawFlyingCoins(view.dt)
  }

  /**
   * If frames average longer than about 19 ms for two seconds, draw at a lower pixel
   * density (2 → 1.5 → 1). Keeps older devices smooth; never goes back up during a session.
   */
  private adaptResolution(dt: number): void {
    if (this.maxDpr <= 1 || dt <= 0 || dt > 0.25) return
    // Smoothed frame time, so alternating fast and slow frames still count as slow.
    this.avgDt += (dt - this.avgDt) * 0.05
    this.slowFrames = this.avgDt > 0.019 ? this.slowFrames + 1 : 0
    if (this.slowFrames > 120) {
      this.maxDpr = this.maxDpr > 1.5 ? 1.5 : 1
      this.slowFrames = 0
      this.resize()
    }
  }

  /** The finish line: a chequered arch over the track and a chequered strip on the ground. */
  private drawFinish(height: HeightFn, x: number): void {
    const { ctx } = this
    const y = height(x)
    const tall = 4.2
    const chequer = (x0: number, y0: number, w: number, h: number, cols: number, rows: number) => {
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#1d2433' : '#ffffff'
          ctx.fillRect(x0 + (i * w) / cols, y0 + (j * h) / rows, w / cols + 0.002, h / rows + 0.002)
        }
      }
    }
    // Ground strip
    chequer(x - 0.25, y - 0.12, 0.5, 0.24, 2, 1)
    // Posts and banner
    for (const px of [x - 1.6, x + 1.6]) {
      ctx.fillStyle = '#d7dce4'
      ctx.fillRect(px - 0.08, height(px), 0.16, tall + y - height(px))
      ctx.lineWidth = 0.04
      ctx.strokeStyle = OUTLINE
      ctx.strokeRect(px - 0.08, height(px), 0.16, tall + y - height(px))
    }
    chequer(x - 1.7, y + tall - 0.1, 3.4, 0.6, 12, 2)
    ctx.lineWidth = 0.05
    ctx.strokeStyle = OUTLINE
    ctx.strokeRect(x - 1.7, y + tall - 0.1, 3.4, 0.6)
    ctx.save()
    ctx.translate(x, y + tall + 0.95)
    ctx.scale(1, -1)
    ctx.font = `900 0.6px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 0.14
    ctx.strokeStyle = OUTLINE
    ctx.strokeText('FINISH', 0, 0)
    ctx.fillStyle = '#ffd23f'
    ctx.fillText('FINISH', 0, 0)
    ctx.restore()
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

  /** A soft shadow on the ground under the vehicle, fading as it rises. */
  private drawShadow(view: View, chassis: Pose): void {
    const { ctx } = this
    const xs = view.spec.wheels.map((w) => w.anchor.x)
    const half = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.6
    const ground = view.height(chassis.x)
    const gap = Math.max(0, chassis.y - ground - 0.6)
    const alpha = Math.max(0, 0.35 - gap * 0.05)
    if (alpha <= 0.01) return
    const w = half * (1 + gap * 0.08)
    ctx.save()
    ctx.translate(chassis.x, ground + 0.02)
    ctx.scale(1, 0.18)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w)
    g.addColorStop(0, `rgba(0, 0, 0, ${alpha})`)
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, w, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** Dust from spinning wheels, exhaust puffs on the gas, and puffs on landing. */
  private effects(view: View, chassis: Pose): void {
    const { next, spec, env } = view
    const dust = themeFor(env).dust
    const pipe = EXHAUST[spec.id]
    if (pipe && this.backfire && !view.driver.ragdoll) {
      this.backfire = false
      const c = Math.cos(chassis.angle)
      const s = Math.sin(chassis.angle)
      const px = chassis.x + pipe[0] * c - pipe[1] * s
      const py = chassis.y + pipe[0] * s + pipe[1] * c
      const back = chassis.angle + Math.PI
      this.particles.emit(px, py, { count: 4, speed: 2.2, colour: 'rgba(255, 170, 40, 0.95)', size: 0.11, life: 0.14, dir: back, gravity: 0 })
      this.particles.emit(px, py, { count: 2, speed: 1.4, colour: 'rgba(255, 240, 160, 0.95)', size: 0.07, life: 0.1, dir: back, gravity: 0 })
      this.particles.emit(px, py, { count: 4, speed: 1.2, colour: 'rgba(110, 115, 125, 0.65)', size: 0.16, life: 0.8, dir: back, up: 0.4, gravity: 0.6 })
    }
    if (pipe && view.input.gas && !view.driver.ragdoll && Math.random() < 0.3) {
      const c = Math.cos(chassis.angle)
      const s = Math.sin(chassis.angle)
      const px = chassis.x + pipe[0] * c - pipe[1] * s
      const py = chassis.y + pipe[0] * s + pipe[1] * c
      this.particles.emit(px, py, { count: 1, speed: 0.6, colour: 'rgba(120, 125, 135, 0.6)', size: 0.12, life: 0.7, dir: chassis.angle + Math.PI, up: 0.5, gravity: 0.6 })
    }
    next.wheels.forEach((w, i) => {
      if (!next.wheelContacts[i]) return
      const r = spec.wheels[i].radius
      const driven = spec.wheels[i].axle === 'rear' || spec.engine.frontShare > 0
      if (driven && view.input.gas && Math.random() < 0.35) {
        this.particles.emit(w.x - r * 0.6, w.y - r * 0.8, { count: 1, speed: 1.5, colour: dust, size: 0.12, life: 0.6, dir: Math.PI * 0.85, up: 0.4 })
      }
    })
    if (this.wasAirborne && !next.airborne) {
      for (const w of next.wheels) this.particles.emit(w.x, w.y - 0.4, { count: 8, speed: 2.4, colour: dust, size: 0.18, life: 0.8, up: 0.3 })
      const fall = Math.abs(next.speed) * 0.02 + Math.max(0, -(next.chassis.y - view.prev.chassis.y) * 60) * 0.06
      if (fall > 0.25) this.shake(fall * 0.6)
    }
    this.wasAirborne = next.airborne
    void chassis
  }

  /**
   * Ghost riders: see-through vehicles from recorded runs, behind the player's, each with a
   * name tag in its player's colour. Visual only; they never touch the physics.
   */
  private drawGhosts(view: View): void {
    const { ctx } = this
    for (const g of view.ghosts) {
      const { chassis: c, hubs, wheelAngles, fade } = g.pose
      const cos = Math.cos(c.angle)
      const sin = Math.sin(c.angle)
      ctx.save()
      ctx.globalAlpha = 0.38 * fade
      const drawn = drawnHubs(g.spec, hubs)
      drawn.forEach(([hx, hy], i) => {
        const r = g.spec.wheels[i]?.radius ?? 0.4
        ctx.save()
        ctx.translate(c.x + hx * cos - hy * sin, c.y + hx * sin + hy * cos)
        ctx.rotate(wheelAngles[i])
        drawWheel(ctx, r, { mx: g.spec.id === 'scrambler' })
        ctx.restore()
      })
      ctx.translate(c.x, c.y)
      ctx.rotate(c.angle)
      drawVehicle(ctx, g.spec, 0, true, 'normal', drawn)
      ctx.restore()
      // Name tag above the ghost, upright whatever its angle.
      const head = g.spec.driver.head
      const tx = c.x + head.x * cos - (head.y + 0.55) * sin
      const ty = c.y + head.x * sin + (head.y + 0.55) * cos
      ctx.save()
      ctx.translate(tx, ty)
      ctx.scale(1 / (this.width / this.viewWidth), -1 / (this.width / this.viewWidth))
      ctx.globalAlpha = 0.9 * fade
      ctx.font = `800 13px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const w = ctx.measureText(g.label).width + 14
      ctx.beginPath()
      ctx.roundRect(-w / 2, -10, w, 20, 10)
      ctx.fillStyle = 'rgba(16, 21, 28, 0.55)'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = g.colour
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(g.label, 0, 1)
      ctx.restore()
    }
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
    // Suspension: a lower arm from the chassis to the hub, and a coil spring that visibly
    // squashes as the suspension compresses. Behind the wheels and body.
    // The bike draws its own swingarm, shock and fork (art.ts), following the hubs.
    if (spec.id !== 'scrambler') next.wheels.forEach((_, i) => {
      const w = lerpPose(prev.wheels[i], next.wheels[i], alpha)
      const a = spec.wheels[i].anchor
      const inward = a.x < 0 ? 0.45 : -0.45
      const pivot = toWorld(a.x + inward, a.y + 0.12)
      const top = toWorld(a.x, a.y + 0.5)
      ctx.lineCap = 'round'
      for (const [lw, col] of [[0.17, OUTLINE], [0.11, '#5b6372']] as const) {
        ctx.beginPath()
        ctx.moveTo(pivot.x, pivot.y)
        ctx.lineTo(w.x, w.y)
        ctx.lineWidth = lw
        ctx.strokeStyle = col
        ctx.stroke()
      }
      const dx = w.x - top.x
      const dy = w.y - top.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const coils = 6
      const width = 0.1
      for (const [lw, col] of [[0.09, OUTLINE], [0.05, '#f2b632']] as const) {
        ctx.beginPath()
        ctx.moveTo(top.x, top.y)
        for (let k = 1; k < coils * 2; k++) {
          const t = k / (coils * 2)
          const side = k % 2 ? width : -width
          ctx.lineTo(top.x + dx * t + nx * side, top.y + dy * t + ny * side)
        }
        ctx.lineTo(w.x, w.y)
        ctx.lineWidth = lw
        ctx.strokeStyle = col
        ctx.stroke()
      }
    })
    if (rag) this.drawRagdollBody(rag.torso)
    // Wheel centres in chassis coordinates, adjusted to the suspension's drawn geometry.
    const c = Math.cos(chassis.angle)
    const s = Math.sin(chassis.angle)
    const hubs = drawnHubs(spec, next.wheels.map((_, i): [number, number] => {
      const w = lerpPose(prev.wheels[i], next.wheels[i], alpha)
      const dx = w.x - chassis.x
      const dy = w.y - chassis.y
      return [dx * c + dy * s, -dx * s + dy * c]
    }))
    next.wheels.forEach((_, i) => {
      const w = lerpPose(prev.wheels[i], next.wheels[i], alpha)
      const at = toWorld(hubs[i][0], hubs[i][1])
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.rotate(w.angle)
      const spin = (next.wheels[i].angle - prev.wheels[i].angle) * 60
      drawWheel(ctx, spec.wheels[i].radius, { spin, grime: GRIME[view.env.id], mx: spec.id === 'scrambler' })
      ctx.restore()
    })
    ctx.save()
    ctx.translate(chassis.x, chassis.y)
    ctx.rotate(chassis.angle)
    // Upshift: the rider rocks back with the surge, then settles.
    const k = Math.min(1, this.shiftT / 0.35)
    const rock = this.shiftUp && k < 1 ? 0.13 * Math.sin(k * Math.PI) * (1 - k * 0.5) : 0
    drawVehicle(ctx, spec, view.driver.lean + rock, !rag, this.mood(view, chassis), hubs)
    ctx.restore()
    if (rag) {
      ctx.save()
      ctx.translate(rag.head.x, rag.head.y)
      ctx.rotate(rag.head.angle)
      drawHead(ctx, spec.driver.headRadius, 'worried')
      ctx.restore()
    }
  }

  /** Grin after stunts and in long jumps; worried when the car tips too far. */
  private mood(view: View, chassis: Pose): Mood {
    this.cheerTime = Math.max(0, this.cheerTime - view.dt)
    this.airTime = view.next.airborne ? this.airTime + view.dt : 0
    const tilt = Math.abs(chassis.angle - Math.PI * 2 * Math.round(chassis.angle / (Math.PI * 2)))
    const slope = Math.atan(view.height(chassis.x + 1) - view.height(chassis.x - 1)) / 2
    if (tilt > 1.6 || (!view.next.airborne && Math.abs(chassis.angle - slope) > 0.9)) return 'worried'
    if (this.cheerTime > 0 || this.airTime > 0.5) return 'happy'
    return 'normal'
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

  /** Rev counter: an arc with a red line, a needle, and the gear number that pops on a shift. */
  private drawRevGauge(view: View, cx: number, cy: number): void {
    const { ctx } = this
    const r = 22
    const revs = view.next.revs + (view.input.gas && !view.next.shifting ? 0.08 : 0)
    this.needle += (Math.min(1, revs) - this.needle) * Math.min(1, view.dt * 18)
    const a0 = Math.PI * 0.8
    const a1 = Math.PI * 2.2
    const at = (v: number) => a0 + (a1 - a0) * v
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(16, 21, 28, 0.45)'
    ctx.fill()
    ctx.lineCap = 'round'
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, at(0.85))
    ctx.stroke()
    ctx.strokeStyle = '#e5383b'
    ctx.beginPath()
    ctx.arc(cx, cy, r, at(0.85), a1)
    ctx.stroke()
    // Lit sweep up to the needle.
    ctx.strokeStyle = this.needle > 0.85 ? '#ff6b6b' : '#ffd23f'
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, at(Math.max(0.001, this.needle)))
    ctx.stroke()
    const na = at(this.needle)
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(na) * 6, cy + Math.sin(na) * 6)
    ctx.lineTo(cx + Math.cos(na) * (r + 2), cy + Math.sin(na) * (r + 2))
    ctx.stroke()
    // Gear number: pops and flashes gold on a shift.
    const k = Math.min(1, this.shiftT / 0.35)
    const pop = 1 + 0.45 * Math.sin(k * Math.PI) * (1 - k)
    ctx.translate(cx, cy + 1)
    ctx.scale(pop, pop)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.outlinedText(`${view.next.gear}`, 0, 0, 18, k < 1 ? '#ffd23f' : '#ffffff')
    ctx.restore()
  }

  private drawHud(view: View): void {
    const { ctx, width, height: h, safe } = this
    const x0 = Math.max(16, safe.left)
    const y0 = Math.max(12, safe.top)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    // Endless: distance so far. Race: the clock, and how far is left to the finish.
    const headline = view.race ? formatTime(view.race.time) : `${Math.floor(view.next.distance)} m`
    this.outlinedText(headline, x0, y0, 20)
    if (view.race) {
      const left = Math.max(0, Math.ceil(view.race.length - view.next.distance))
      ctx.textAlign = 'center'
      this.outlinedText(left > 0 ? `${left} m to go` : 'Finish!', width / 2, y0 + 36, 15, '#ffffff')
      ctx.textAlign = 'left'
    }
    if (view.player) {
      ctx.font = `800 20px ${FONT}`
      const dx = ctx.measureText(headline).width + 10
      this.outlinedText(view.player.name, x0 + dx, y0 + 2, 17, view.player.colour)
    }

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
    if (view.spec.engine.gearbox) this.drawRevGauge(view, gx + gw + 34, gy + 6)

    // Coins this run, in a pill at the top centre; it pops when a coin lands in it.
    ctx.save()
    const pop = 1 + 0.18 * Math.sin(this.counterPop * Math.PI)
    ctx.translate(width / 2, y0 + 12)
    ctx.scale(pop, pop)
    ctx.translate(-width / 2, -(y0 + 12))
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
    ctx.restore()

    // Stunt and milestone pop-ups
    let row = 0
    for (const p of view.popups) {
      if (p.at) continue
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.6 - p.age) / 0.4))
      this.outlinedText(p.text, width / 2, h * 0.2 + row * 34 - p.age * 10, 26)
      ctx.globalAlpha = 1
      row++
    }

    if (view.showPedals) this.drawPedals(view.input, view.swapPedals)
  }

  private drawPedals(input: Input, swap: boolean): void {
    const { ctx, width, height: h, safe } = this
    const pw = 78
    const ph = 92
    const y = h - ph - 16 - safe.bottom
    const pedal = (x: number, active: boolean, colour: string, label: string) => {
      ctx.save()
      ctx.translate(x + pw / 2, y + ph / 2)
      if (active) ctx.scale(0.94, 0.94)
      ctx.globalAlpha = active ? 0.6 : 0.28
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
    const leftX = Math.max(20, safe.left)
    const rightX = width - pw - Math.max(20, safe.right)
    pedal(swap ? rightX : leftX, input.brake, '#ff8080', 'BRAKE')
    pedal(swap ? leftX : rightX, input.gas, '#7dff9a', 'GAS')
    ctx.textBaseline = 'top'
  }
}
