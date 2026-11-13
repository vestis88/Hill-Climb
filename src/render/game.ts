import { setPiecesBetween } from '../sim/terrain'
import { featuresBetween, stuntObstacles } from '../sim/stunt'
import { LAUNCH, type LaunchKind } from '../sim/launch'
import { genitive } from '../data/players'
import type { Environment } from '../data/environments'
import type { Pickup } from '../data/track'
import type { HeightFn, Input, Pose, SimState, VehicleSpec } from '../sim/types'
import { ghostNearFade, type GhostPose } from '../save/ghosts'
import type { Puddle, PuddleFn } from '../sim/types'
import { formatTime } from '../data/modes'
import { drawHead, drawnHubs, drawRagdollTorso, drawPickup, drawVehicle, drawWheel, EXHAUST, OUTLINE, setOutfit, setThrusting, type Mood } from './art'
import type { Outfit } from '../data/outfits'
import { Particles } from './particles'
import { drawAtmosphere, drawBackdrop, drawForeground, drawGround, drawProps, drawSolids, drawWeather, themeFor } from './scenery'
import { groundBelow, type LevelGeom } from '../sim/level'
import type { Atmosphere } from '../data/weather'

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
  /** Thrusters (Moon Lander): tank left 0..1 and whether they are firing. */
  thrust?: { left: number; on: boolean }
  /** Hidden stars still to find on this map. */
  stars?: { x: number; y: number }[]
  /** Turbo left, 0..1 (from a turbo canister). */
  turbo?: number
  /** A trick chain of two or more, for the live combo counter. */
  combo?: { tricks: number; multiplier: number } | null
  /** The wheelie in progress, for the live counter. */
  wheelie?: { metres: number; coins: number; multiplier: number } | null
  /** Time of day and weather: today's challenge only; none in the garage.  */
  atmosphere?: Atmosphere
  /** Metres to the next fuel can, if there is one ahead. */
  nextFuel?: number | null
  /**
   * A Klurbana: its solids and loops, the gems still out there, the goal flag (lit once every
   * gem is taken), and the clock for the HUD.
   */
  level?: { geom: LevelGeom; gems: { x: number; y: number }[]; total: number; goal: { x: number; y: number }; time: number }
  /** Stuntbanan: each seesaw's plank angle by id (from the sim; at rest when missing). */
  seesaws?: Map<string, number>
  /** Puddles on the track, to draw and splash through. */
  puddles?: PuddleFn
  /** Race mode: the length (the finish line's distance from the start) and the clock, seconds. */
  race?: { length: number; time: number }
  /** Engine revs to show, 0..1: they rise and fall at the engine's own pace (sim/launch.ts). */
  revs: number
  /** The start countdown: seconds left before GO; shown while above 0. */
  countdown?: number
  /** Ghost riders to race: a recorded pose, its vehicle and a name tag. */
  ghosts: { label: string; colour: string; spec: VehicleSpec; pose: GhostPose; outfit?: Outfit }[]
  /** The driving player's outfit (helmet colour, pattern, hat). */
  outfit?: Outfit
}

const FONT = "ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif"

/** Mud, dust or snow on the tyres, per environment. */
const GRIME: Record<string, string> = {
  meadow: 'rgba(110, 76, 44, 0.9)', crater: 'rgba(190, 190, 200, 0.85)', frost: 'rgba(255, 255, 255, 0.95)',
  dunes: 'rgba(232, 200, 143, 0.9)', canyon: 'rgba(190, 100, 60, 0.9)', woods: 'rgba(70, 48, 30, 0.95)',
  stunt: 'rgba(150, 110, 80, 0.9)',
}

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
  /** Seconds since GO (big while the countdown runs), and how the start went. */
  private goT = 9
  private goKind: LaunchKind = 'normal'
  /** The wheelie multiplier last shown, and seconds since it rose (for its pop). */
  private wheelieMult = 1
  private wheeliePop = 9
  private wasAirborne = false
  private shakeAmount = 0
  private toScreen = (x: number, y: number) => ({ x, y })
  /** Coins flying from where they were picked up to the counter, and the counter's pop. */
  private flying: { x: number; y: number; t: number }[] = []
  private counterPop = 0
  /** Seconds since a fuel-on-empty rescue: drives the flash and the banner. */
  private rescueT = 9
  private rescueText = ''
  private vignette: CanvasGradient | null = null
  private vignetteSize = ''
  /** Seconds left of Pip's grin after a stunt or bonus. */
  private cheerTime = 0
  private airTime = 0
  /** Safe-area insets (notch, home bar, rounded corners), CSS pixels. */
  private safe = { top: 0, right: 0, bottom: 0, left: 0 }
  /** Highest pixel density to draw at; lowered automatically if frames run slow. */
  private maxDpr = 2
  /** Seconds the smoothed frame time has stayed slow. */
  private slowTime = 0
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

  /**
   * Reaching a fuel can on an empty tank: a burst of gold and fire, a flash, a shake, a shower
   * of coins into the counter and a big banner.
   */
  fuelRescue(x: number, y: number, bonus: number): void {
    this.particles.emit(x, y, { count: 36, speed: 6, colour: '#ffd23f', size: 0.13, life: 0.9, gravity: -3 })
    this.particles.emit(x, y, { count: 18, speed: 4.5, colour: '#ff7a3a', size: 0.17, life: 0.7, gravity: -1 })
    this.particles.emit(x, y, { count: 12, speed: 2.5, colour: '#ffffff', size: 0.1, life: 0.5, gravity: 0 })
    this.shake(0.5)
    this.rescueT = 0
    this.rescueText = `+${bonus}`
    const p = this.toScreen(x, y)
    // Staggered so they stream in one after another.
    for (let i = 0; i < 14; i++) this.flying.push({ x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 40, t: -i * 0.06 })
  }

  /** The rescue flash and banner, over everything. */
  private drawRescue(dt: number): void {
    if (this.rescueT > 2.2) return
    this.rescueT += dt
    const { ctx, width, height: h } = this
    const t = this.rescueT
    if (t < 0.35) {
      ctx.fillStyle = `rgba(255, 220, 120, ${0.45 * (1 - t / 0.35)})`
      ctx.fillRect(0, 0, width, h)
    }
    const fade = t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.5)
    const pop = t < 0.25 ? 0.4 + 0.75 * Math.sin((t / 0.25) * Math.PI * 0.5) * 1.15 : 1 + 0.06 * Math.sin(t * 9) * Math.max(0, 1 - t)
    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(width / 2, h * 0.32)
    ctx.scale(pop, pop)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.outlinedText('RÄDDAD PÅ TOM TANK!', 0, 0, Math.min(44, width / 16), '#ffffff')
    this.outlinedText(this.rescueText, 0, Math.min(52, width / 14), Math.min(56, width / 12), '#ffd23f')
    ctx.restore()
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
      if (c.t < 0) continue
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
    // A tall, narrow view (a duel side by side) shows less width, so the vehicle stays a good size.
    const narrow = this.height > this.width
    this.viewWidth = lerp(this.viewWidth, narrow ? Math.min(22, 14 + speed * 0.4) : Math.min(34, 22 + speed * 0.55), 0.03)
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

    if (view.level) {
      const lv = view.level
      for (const l of lv.geom.loops ?? []) if (l.cx + l.r > left && l.cx - l.r < right) this.drawLoop((x) => groundBelow(lv.geom, x, l.cy), l.cx, l.cy, l.r)
      drawSolids(ctx, env, lv.geom.polygons, left, right)
      this.drawGoal(lv.goal.x, lv.goal.y, lv.gems.length === 0)
      for (const g of lv.gems) if (g.x > left - 1 && g.x < right + 1) this.drawGem(g.x, g.y)
    } else {
      drawProps(ctx, env, height, left, right)
      drawGround(ctx, env, height, left, right, bottom, this.camY + this.viewWidth, this.time)
      this.drawPuddles(view, left, right)
      if (env.stunt) this.drawStunts(view, height, left, right)
      else this.drawSetPieces(view, height, left, right)
      this.drawSigns(height, left, right)
    }
    if (view.race && view.race.length > left - 3 && view.race.length < right + 3) this.drawFinish(height, view.race.length)
    this.drawShadow(view, chassis)
    for (const p of view.pickups) if (!p.taken && p.x > left - 1 && p.x < right + 1) drawPickup(ctx, p, this.time)
    for (const st of view.stars ?? []) if (st.x > left - 1 && st.x < right + 1) this.drawStar(st.x, st.y)

    this.effects(view, chassis)
    this.drawGhosts(view, chassis)
    this.drawVehicle(view, chassis)
    this.particles.update(view.dt)
    this.particles.draw(ctx)
    this.drawWorldPopups(view)
    ctx.restore()

    drawForeground(ctx, env, width, h, this.camX, this.time)
    drawWeather(ctx, env, width, h, this.camX, this.time)
    if (view.atmosphere) {
      const p = this.toScreen(chassis.x + 1.2 * Math.cos(chassis.angle), chassis.y + 1.2 * Math.sin(chassis.angle))
      drawAtmosphere(ctx, view.atmosphere, width, h, this.camX, this.time, { x: p.x, y: p.y, r: Math.min(width, h) * 0.45 })
    }
    this.drawSpeedLines(view)
    this.drawVignette()
    this.drawRescue(view.dt)
    if (view.showHud) this.drawHud(view)
    if (view.showHud) this.drawCountdown(view)
    if (view.showHud) this.drawWheelie(view)
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
    // Counted in seconds, not frames: on a slow device, 120 frames could take ten seconds.
    this.slowTime = this.avgDt > 0.019 ? this.slowTime + dt : 0
    if (this.slowTime > 2) {
      this.maxDpr = this.maxDpr > 1.5 ? 1.5 : 1
      this.slowTime = 0
      this.resize()
    }
  }

  /**
   * Puddles: a shiny pool lying on the ground, following its shape. Water is blue, mud glossy
   * brown, slush grey-white.
   */
  private drawPuddles(view: View, left: number, right: number): void {
    const fn = view.puddles
    if (!fn) return
    const { ctx } = this
    const found: Puddle[] = []
    for (let x = left; x < right; x += 0.5) {
      const p = fn(x)
      if (p && !found.includes(p)) found.push(p)
    }
    const look = {
      water: { fill: 'rgba(90, 160, 225, 0.85)', edge: 'rgba(40, 90, 150, 0.9)', shine: 'rgba(255, 255, 255, 0.7)' },
      mud: { fill: 'rgba(74, 50, 30, 0.95)', edge: 'rgba(40, 26, 16, 1)', shine: 'rgba(200, 170, 130, 0.55)' },
      slush: { fill: 'rgba(205, 222, 238, 0.95)', edge: 'rgba(140, 165, 190, 0.9)', shine: 'rgba(255, 255, 255, 0.9)' },
    }
    for (const p of found) {
      const c = look[p.kind]
      const steps = Math.max(4, Math.ceil((p.end - p.start) / 0.5))
      // Ends taper; the pool sits a touch above the ground and dips a little into it.
      const yAt = (i: number) => view.height(p.start + ((p.end - p.start) * i) / steps)
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const x = p.start + ((p.end - p.start) * i) / steps
        const taper = Math.sin((Math.PI * i) / steps)
        ctx.lineTo(x, yAt(i) + 0.05 + 0.06 * taper)
      }
      for (let i = steps; i >= 0; i--) {
        const x = p.start + ((p.end - p.start) * i) / steps
        const taper = Math.sin((Math.PI * i) / steps)
        ctx.lineTo(x, yAt(i) - 0.16 * taper)
      }
      ctx.closePath()
      ctx.fillStyle = c.fill
      ctx.fill()
      ctx.lineWidth = 0.04
      ctx.strokeStyle = c.edge
      ctx.stroke()
      // A glint along the surface, shimmering.
      ctx.strokeStyle = c.shine
      ctx.lineWidth = 0.05
      ctx.lineCap = 'round'
      const a = 0.2 + 0.08 * Math.sin(this.time * 2 + p.start)
      ctx.beginPath()
      for (let i = Math.floor(steps * a); i <= Math.ceil(steps * (a + 0.3)); i++) {
        const x = p.start + ((p.end - p.start) * i) / steps
        ctx.lineTo(x, yAt(i) + 0.09)
      }
      ctx.stroke()
    }
  }

  /**
   * Stuntbanan's pieces: loops (a steel ring track on legs), seesaws (a plank on a trestle) and
   * hazard posts at each pit's edges. The car is drawn after, so it rides on the inside of a loop.
   */
  private drawStunts(view: View, height: HeightFn, left: number, right: number): void {
    const { ctx } = this
    const seed = view.env.seed
    for (const f of featuresBetween(seed, left - 10, right + 10)) {
      if (f.kind !== 'gap') continue
      // Striped posts at the take-off lip and the landing edge.
      for (const px of [f.start + 6.9, f.start + 7 + f.size + 0.1]) {
        const y = height(px)
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? '#1d2433' : '#ffd23f'
          ctx.fillRect(px - 0.09, y + i * 0.3, 0.18, 0.3)
        }
        ctx.lineWidth = 0.04
        ctx.strokeStyle = OUTLINE
        ctx.strokeRect(px - 0.09, y, 0.18, 1.2)
        ctx.fillStyle = '#e5383b'
        ctx.beginPath()
        ctx.arc(px, y + 1.32, 0.13, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    for (const o of stuntObstacles(seed)(left - 10, right + 10)) {
      if (o.kind === 'loop') {
        this.drawLoop(height, o.cx, o.cy, o.r)
      } else {
        const angle = view.seesaws?.get(o.id) ?? 0.28
        const gy = height(o.x)
        // Trestle
        ctx.fillStyle = '#7a5236'
        ctx.strokeStyle = OUTLINE
        ctx.lineWidth = 0.05
        ctx.beginPath()
        ctx.moveTo(o.x - 0.7, gy - 0.1)
        ctx.lineTo(o.x + 0.7, gy - 0.1)
        ctx.lineTo(o.x, o.y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        // Plank, with hazard ends
        ctx.save()
        ctx.translate(o.x, o.y)
        ctx.rotate(angle)
        const half = o.length / 2
        ctx.fillStyle = '#c08a52'
        ctx.fillRect(-half, -0.13, o.length, 0.26)
        for (const end of [-half, half - 0.6]) {
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i % 2 ? '#1d2433' : '#ffd23f'
            ctx.fillRect(end + i * 0.2, -0.13, 0.2, 0.26)
          }
        }
        ctx.strokeRect(-half, -0.13, o.length, 0.26)
        ctx.restore()
        ctx.fillStyle = '#59627a'
        ctx.beginPath()
        ctx.arc(o.x, o.y, 0.14, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /** A loop: a steel ring track on legs (the car rides on its inside). */
  private drawLoop(height: HeightFn, cx: number, cy: number, r: number): void {
    const { ctx } = this
    // Legs from the sides of the ring down to the ground.
    ctx.strokeStyle = '#59627a'
    ctx.lineWidth = 0.16
    for (const side of [-1, 1]) {
      const lx = cx + side * (r + 0.15)
      ctx.beginPath()
      ctx.moveTo(lx, cy)
      ctx.lineTo(cx + side * (r * 0.75), height(cx + side * r * 0.75))
      ctx.stroke()
    }
    // The track band (outside the radius the car drives on), with a lit inner edge.
    ctx.lineWidth = 0.42
    ctx.strokeStyle = OUTLINE
    ctx.beginPath()
    ctx.arc(cx, cy, r + 0.22, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 0.3
    ctx.strokeStyle = '#8d97b0'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 0.22, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 0.08
    ctx.strokeStyle = '#ffd23f'
    ctx.setLineDash([0.5, 0.5])
    ctx.beginPath()
    ctx.arc(cx, cy, r + 0.12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  /** A gem to pick up in a Klurbana: a purple crystal, turning and glowing. */
  private drawGem(x: number, y: number): void {
    const { ctx } = this
    ctx.save()
    ctx.translate(x, y + Math.sin(this.time * 2.2 + x) * 0.1)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.1)
    g.addColorStop(0, 'rgba(200, 120, 255, 0.55)')
    g.addColorStop(1, 'rgba(200, 120, 255, 0)')
    ctx.fillStyle = g
    ctx.fillRect(-1.1, -1.1, 2.2, 2.2)
    ctx.scale(Math.abs(Math.cos(this.time * 1.6 + x)) * 0.55 + 0.45, 1)
    ctx.beginPath()
    ctx.moveTo(0, 0.5)
    ctx.lineTo(0.38, 0.12)
    ctx.lineTo(0, -0.5)
    ctx.lineTo(-0.38, 0.12)
    ctx.closePath()
    ctx.fillStyle = '#b44cff'
    ctx.fill()
    ctx.lineWidth = 0.06
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-0.38, 0.12)
    ctx.lineTo(0.38, 0.12)
    ctx.moveTo(0, 0.5)
    ctx.lineTo(-0.1, 0.12)
    ctx.lineTo(0, -0.5)
    ctx.lineWidth = 0.035
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.stroke()
    ctx.restore()
  }

  /** The goal flag: chequered once every gem is taken, grey before. */
  private drawGoal(x: number, y: number, open: boolean): void {
    const { ctx } = this
    const base = y - 0.9
    if (open) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 2.2)
      g.addColorStop(0, 'rgba(255, 230, 120, 0.5)')
      g.addColorStop(1, 'rgba(255, 230, 120, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - 2.2, y - 2.2, 4.4, 4.4)
    }
    ctx.fillStyle = '#d7dce4'
    ctx.fillRect(x - 0.06, base, 0.12, 2.6)
    ctx.lineWidth = 0.04
    ctx.strokeStyle = OUTLINE
    ctx.strokeRect(x - 0.06, base, 0.12, 2.6)
    const wave = Math.sin(this.time * 4) * 0.08
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? (open ? '#1d2433' : '#7a808c') : open ? '#ffffff' : '#b9bec7'
        ctx.fillRect(x + 0.06 + i * 0.28, base + 1.7 + j * 0.28 + wave * i * 0.5, 0.29, 0.29)
      }
    }
    ctx.strokeRect(x + 0.06, base + 1.7, 1.12, 0.84)
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
    ctx.fillText('MÅL', 0, 0)
    ctx.restore()
  }

  /**
   * Dress the set pieces (sim/terrain.ts): the table-top is a wooden bridge deck on posts, and the
   * double jump has a log at each lip. Visual only; the ground shape is the physics.
   */
  private drawSetPieces(view: View, height: HeightFn, left: number, right: number): void {
    const { ctx } = this
    const flat = view.env.terrain.flatStart
    for (const p of setPiecesBetween(view.env.seed, left - flat - 40, right - flat + 40)) {
      const x0 = flat + p.start
      if (p.kind === 'table') {
        // Posts down from the deck, then planks along the surface.
        ctx.fillStyle = '#6e4325'
        for (let x = x0 + 3; x < x0 + p.length - 2; x += 3.5) ctx.fillRect(x - 0.1, height(x) - 2.2, 0.2, 2.1)
        ctx.lineWidth = 0.05
        ctx.strokeStyle = OUTLINE
        for (let x = x0; x < x0 + p.length; x += 0.5) {
          const y1 = height(x)
          const y2 = height(x + 0.5)
          ctx.beginPath()
          ctx.moveTo(x + 0.03, y1 + 0.02)
          ctx.lineTo(x + 0.47, y2 + 0.02)
          ctx.lineTo(x + 0.47, y2 - 0.22)
          ctx.lineTo(x + 0.03, y1 - 0.22)
          ctx.closePath()
          ctx.fillStyle = Math.floor((x - x0) * 2) % 2 ? '#b5763f' : '#a5672f'
          ctx.fill()
          ctx.stroke()
        }
      } else if (p.kind === 'double') {
        // A log lying across each lip.
        for (const lip of [7, 25]) {
          const x = x0 + lip - 0.4
          const y = height(x) + 0.05
          ctx.beginPath()
          ctx.arc(x, y, 0.32, 0, Math.PI * 2)
          ctx.fillStyle = '#8a5a33'
          ctx.fill()
          ctx.lineWidth = 0.06
          ctx.strokeStyle = OUTLINE
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x, y, 0.16, 0, Math.PI * 2)
          ctx.strokeStyle = '#c99a64'
          ctx.stroke()
        }
      }
    }
  }

  /** A hidden star: gold, slowly turning and glowing. */
  private drawStar(x: number, y: number): void {
    const { ctx } = this
    ctx.save()
    ctx.translate(x, y + Math.sin(this.time * 2 + x) * 0.12)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.2)
    g.addColorStop(0, 'rgba(255, 220, 90, 0.55)')
    g.addColorStop(1, 'rgba(255, 220, 90, 0)')
    ctx.fillStyle = g
    ctx.fillRect(-1.2, -1.2, 2.4, 2.4)
    ctx.scale(Math.abs(Math.cos(this.time * 1.5 + x)) * 0.6 + 0.4, 1)
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? 0.24 : 0.55
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fillStyle = '#ffcf33'
    ctx.fill()
    ctx.lineWidth = 0.06
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
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
    // Splashes from wheels running through a puddle, more the faster it goes.
    if (view.puddles && !view.driver.ragdoll) {
      const speed = Math.abs(next.speed)
      const splash = { water: 'rgba(150, 200, 245, 0.85)', mud: 'rgba(80, 55, 34, 0.95)', slush: 'rgba(235, 242, 250, 0.95)' }
      next.wheels.forEach((w, i) => {
        const p = next.wheelContacts[i] ? view.puddles!(w.x) : null
        if (!p || speed < 1 || Math.random() > Math.min(0.9, speed / 10)) return
        const r = spec.wheels[i].radius
        this.particles.emit(w.x - r * 0.3, w.y - r * 0.7, { count: 2 + Math.floor(speed / 5), speed: 1.5 + speed * 0.25, colour: splash[p.kind], size: 0.1, life: 0.55, dir: Math.PI * 0.75, up: 1.5, gravity: -9 })
      })
    }
    next.wheels.forEach((w, i) => {
      if (!next.wheelContacts[i]) return
      const r = spec.wheels[i].radius
      const driven = spec.wheels[i].axle === 'rear' || spec.engine.frontShare > 0
      // Wheelspin: the tyre surface far outruns the vehicle, so it throws smoke and dirt.
      const surface = Math.abs(next.wheels[i].angle - view.prev.wheels[i].angle) * 60 * r
      if (driven && surface > Math.abs(next.speed) * 1.6 + 3) {
        this.particles.emit(w.x - r * 0.5, w.y - r * 0.85, { count: 2, speed: 1.2, colour: 'rgba(225, 225, 230, 0.7)', size: 0.3, life: 1.1, dir: Math.PI * 0.8, up: 0.9, gravity: 0.4 })
        this.particles.emit(w.x - r * 0.6, w.y - r * 0.8, { count: 2, speed: 3.5, colour: dust, size: 0.12, life: 0.5, dir: Math.PI * 0.88, up: 1 })
      } else if (driven && view.input.gas && Math.random() < 0.35) {
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
  private drawGhosts(view: View, me: Pose): void {
    const { ctx } = this
    // Name tags already placed (in pixels, y up), so overlapping tags stack instead of piling up.
    const placed: { x: number; y: number; w: number }[] = []
    const k = this.width / this.viewWidth
    for (const g of view.ghosts) {
      const { chassis: c, hubs, wheelAngles } = g.pose
      // Fade out near the player's vehicle so a ghost never gets in the way: gone when nearly on
      // top of it (under 0.6 m apart), back to full from 4 m.
      const near = ghostNearFade(Math.hypot(c.x - me.x, c.y - me.y))
      const fade = g.pose.fade * near
      if (fade <= 0.01) continue
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
        drawWheel(ctx, r, { mx: g.spec.id === 'scrambler', paddle: g.spec.id === 'rover' })
        ctx.restore()
      })
      ctx.translate(c.x, c.y)
      ctx.rotate(c.angle)
      setOutfit(g.outfit ?? null)
      drawVehicle(ctx, g.spec, 0, true, 'normal', drawn, g.colour)
      setOutfit(null)
      ctx.restore()
      // Name tag above the ghost, upright whatever its angle.
      const head = g.spec.driver.head
      const tx = c.x + head.x * cos - (head.y + 0.55) * sin
      let ty = c.y + head.x * sin + (head.y + 0.55) * cos
      ctx.font = `800 13px ${FONT}`
      const w = ctx.measureText(g.label).width + 14
      for (let tries = 0; tries < 8 && placed.some((p) => Math.abs(p.x - tx * k) < (p.w + w) / 2 + 4 && Math.abs(p.y - ty * k) < 23); tries++) ty += 23 / k
      placed.push({ x: tx * k, y: ty * k, w })
      ctx.save()
      ctx.translate(tx, ty)
      ctx.scale(1 / k, -1 / k)
      ctx.globalAlpha = 0.9 * fade
      ctx.font = `800 13px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
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
      drawWheel(ctx, spec.wheels[i].radius, { spin, grime: GRIME[view.env.id], mx: spec.id === 'scrambler', paddle: spec.id === 'rover' })
      ctx.restore()
    })
    ctx.save()
    ctx.translate(chassis.x, chassis.y)
    ctx.rotate(chassis.angle)
    // Upshift: the rider rocks back with the surge, then settles.
    const k = Math.min(1, this.shiftT / 0.35)
    const rock = this.shiftUp && k < 1 ? 0.13 * Math.sin(k * Math.PI) * (1 - k * 0.5) : 0
    setOutfit(view.outfit ?? null)
    setThrusting(view.thrust?.on ?? false)
    drawVehicle(ctx, spec, view.driver.lean + rock, !rag, this.mood(view, chassis), hubs, view.player?.colour)
    ctx.restore()
    if (rag) {
      ctx.save()
      ctx.translate(rag.head.x, rag.head.y)
      ctx.rotate(rag.head.angle)
      drawHead(ctx, spec.driver.headRadius, 'worried')
      ctx.restore()
    }
    setOutfit(null)
    setThrusting(false)
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
    drawRagdollTorso(ctx)
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
    const revs = view.revs + (view.input.gas && !view.next.shifting ? 0.06 : 0)
    this.needle += (Math.min(1, revs) - this.needle) * Math.min(1, view.dt * 24)
    // Gear number: pops and flashes gold on a shift.
    const k = Math.min(1, this.shiftT / 0.35)
    this.drawDial(cx, cy, 34, this.needle, { text: `${view.next.gear}`, pop: 1 + 0.45 * Math.sin(k * Math.PI) * (1 - k), colour: k < 1 ? '#ffd23f' : '#ffffff' })
  }

  /** A rev dial: grey arc, red line from 0.86, an optional green launch window, a lit sweep and a needle. */
  private drawDial(cx: number, cy: number, r: number, value: number, label: { text: string; pop: number; colour: string }, green?: readonly [number, number]): void {
    const { ctx } = this
    const a0 = Math.PI * 0.8
    const a1 = Math.PI * 2.2
    const at = (v: number) => a0 + (a1 - a0) * v
    const red = LAUNCH.green[1]
    const w = Math.max(5, r * 0.2)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r + w, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(16, 21, 28, 0.5)'
    ctx.fill()
    ctx.lineCap = 'butt'
    ctx.lineWidth = w
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, at(red))
    ctx.stroke()
    ctx.strokeStyle = '#e5383b'
    ctx.beginPath()
    ctx.arc(cx, cy, r, at(red), a1)
    ctx.stroke()
    const inGreen = green !== undefined && value >= green[0] && value <= green[1]
    if (green) {
      ctx.strokeStyle = inGreen ? '#7dff8a' : '#2fbf4a'
      ctx.lineWidth = w * 1.7
      ctx.beginPath()
      ctx.arc(cx, cy, r, at(green[0]), at(green[1]))
      ctx.stroke()
      ctx.lineWidth = w
    }
    // Lit sweep up to the needle.
    ctx.lineCap = 'round'
    ctx.lineWidth = w * 0.55
    ctx.strokeStyle = value > red ? '#ff6b6b' : inGreen ? '#b6ffbd' : '#ffd23f'
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, at(Math.max(0.001, value)))
    ctx.stroke()
    // Tick marks.
    ctx.lineWidth = Math.max(1.5, r * 0.04)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    for (let i = 0; i <= 10; i++) {
      const a = at(i / 10)
      const inner = r - w * (i % 5 === 0 ? 1.6 : 1.1)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
      ctx.lineTo(cx + Math.cos(a) * (r - w * 0.6), cy + Math.sin(a) * (r - w * 0.6))
      ctx.stroke()
    }
    const na = at(value)
    ctx.lineWidth = Math.max(3, r * 0.07)
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(na) * r * 0.25, cy + Math.sin(na) * r * 0.25)
    ctx.lineTo(cx + Math.cos(na) * (r + w * 0.4), cy + Math.sin(na) * (r + w * 0.4))
    ctx.stroke()
    ctx.translate(cx, cy + 1)
    ctx.scale(label.pop, label.pop)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.outlinedText(label.text, 0, 0, Math.round(r * 0.75), label.colour)
    ctx.restore()
  }

  /** The start: 3, 2, 1 over a big rev dial with the green launch window, then GO and the verdict. */
  private drawCountdown(view: View): void {
    const { ctx, width, height: h } = this
    const cx = width / 2
    const r = Math.min(90, h * 0.17)
    const cy = h * 0.5
    if (view.countdown !== undefined && view.countdown > 0) {
      this.goT = 0
      this.drawDial(cx, cy + r * 0.35, r, Math.min(1, view.revs), { text: '', pop: 1, colour: '#fff' }, LAUNCH.green)
      const n = Math.ceil(view.countdown / LAUNCH.beat)
      const k = 1 - (view.countdown / LAUNCH.beat - (n - 1))
      ctx.save()
      ctx.translate(cx, cy + r * 0.38)
      const pop = 1 + 0.5 * Math.max(0, 1 - k * 4)
      ctx.scale(pop, pop)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      this.outlinedText(`${n}`, 0, 0, Math.round(r * 0.8), '#ffd23f')
      ctx.restore()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      this.outlinedText('Varva in i det gröna!', cx, cy - r * 0.95, 20, '#ffffff')
      // Whose turn it is, above it all.
      if (view.player) this.outlinedText(`${genitive(view.player.name)} tur`, cx, cy - r * 0.95 - 36, 28, view.player.colour)
      return
    }
    if (this.goT > 1.4) return
    const t = this.goT
    this.goT += view.dt
    const k = Math.min(1, t / 0.25)
    const fade = Math.min(1, (1.4 - t) / 0.4)
    ctx.save()
    ctx.globalAlpha = Math.max(0, fade)
    ctx.translate(cx, cy)
    ctx.scale(0.6 + 0.4 * k + 0.15 * Math.sin(k * Math.PI), 0.6 + 0.4 * k + 0.15 * Math.sin(k * Math.PI))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    this.outlinedText('KÖR!', 0, -10, Math.round(r * 0.75), '#7dff8a')
    if (this.goKind === 'perfect') this.outlinedText('Perfekt start!', 0, r * 0.5, 24, '#ffd23f')
    else if (this.goKind === 'over') this.outlinedText('För högt varv!', 0, r * 0.5, 22, '#ff6b6b')
    ctx.restore()
  }

  /** A live wheelie counter under the coins: metres, the multiplier (it pops when it rises) and coins so far. */
  private drawWheelie(view: View): void {
    const w = view.wheelie
    // The combo counter sits on the right of the top, clear of the wheelie counter.
    if (view.combo) {
      const { ctx: c, width: cw, safe: cs } = this
      c.save()
      c.textAlign = 'right'
      c.textBaseline = 'top'
      const pulse = 1 + 0.06 * Math.sin(this.time * 8)
      c.translate(cw - Math.max(16, cs.right) - 10, Math.max(12, cs.top) + 64)
      c.scale(pulse, pulse)
      this.outlinedText(`Kombo ×${String(view.combo.multiplier).replace('.', ',')}`, 0, 0, 22, '#ff9a3c')
      this.outlinedText(`${view.combo.tricks} trick`, 0, 28, 15, '#ffffff')
      c.restore()
    }
    if (!w || w.metres < 3) {
      this.wheelieMult = 1
      return
    }
    if (w.multiplier > this.wheelieMult) {
      this.wheelieMult = w.multiplier
      this.wheeliePop = 0
    }
    this.wheeliePop += view.dt
    const { ctx, width, safe } = this
    const y = Math.max(12, safe.top) + 58
    const k = Math.min(1, this.wheeliePop / 0.35)
    const pop = 1 + 0.5 * Math.sin(k * Math.PI) * (1 - k)
    const colour = ['#ffffff', '#ffffff', '#7dff8a', '#ffd23f', '#ff9a3c', '#ff5c8a'][Math.min(5, w.multiplier)]
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    this.outlinedText(`Stegring ${Math.floor(w.metres)} m  +${Math.floor(w.coins)}`, width / 2, y, 17, w.metres >= 10 ? '#ffffff' : 'rgba(255,255,255,0.75)')
    if (w.multiplier > 1) {
      ctx.translate(width / 2, y + 34)
      ctx.scale(pop, pop)
      this.outlinedText(`×${w.multiplier}`, 0, -10, 22, colour)
    }
    ctx.restore()
  }

  /** GO: show the verdict on the start. */
  launch(kind: LaunchKind): void {
    this.goKind = kind
    this.goT = 0
    if (kind === 'perfect') {
      this.cheer()
    }
  }

  private drawHud(view: View): void {
    const { ctx, width, height: h, safe } = this
    const x0 = Math.max(16, safe.left)
    const y0 = Math.max(12, safe.top)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    // Endless: distance so far. Race: the clock, and how far is left to the finish.
    const headline = view.level ? formatTime(view.level.time) : view.race ? formatTime(view.race.time) : `${Math.floor(view.next.distance)} m`
    this.outlinedText(headline, x0, y0, 20)
    if (view.race) {
      const left = Math.max(0, Math.ceil(view.race.length - view.next.distance))
      ctx.textAlign = 'center'
      this.outlinedText(left > 0 ? `${left} m kvar` : 'Mål!', width / 2, y0 + 36, 15, '#ffffff')
      ctx.textAlign = 'left'
    }
    if (view.player) {
      ctx.font = `800 20px ${FONT}`
      const dx = ctx.measureText(headline).width + 10
      this.outlinedText(view.player.name, x0 + dx, y0 + 2, 17, view.player.colour)
    }

    // A Klurbana: gems taken out of all, and the goal once they are; no fuel.
    if (view.level) {
      const lv = view.level
      const got = lv.total - lv.gems.length
      this.outlinedText(`◆ ${got}/${lv.total}`, x0, y0 + 30, 20, '#d9a2ff')
      ctx.font = `800 20px ${FONT}`
      const w = ctx.measureText(`◆ ${got}/${lv.total}`).width
      this.outlinedText(lv.gems.length ? 'Ta alla stenar, sen målflaggan' : 'Till målflaggan!', x0 + w + 12, y0 + 33, 15, lv.gems.length ? '#ffffff' : '#ffd23f')
      // Speed, for learning what each jump needs.
      this.outlinedText(`${Math.round(Math.abs(view.next.speed) * 3.6)} km/h`, x0, y0 + 58, 17, '#ffffff')
      return
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
    // How far to the next fuel can, under the gauge; a low-fuel warning flashes after it.
    let warnX = x0
    if (view.nextFuel != null && view.nextFuel > 0) {
      const text = `Bränsle om ${Math.ceil(view.nextFuel)} m`
      ctx.font = `800 15px ${FONT}`
      this.outlinedText(text, x0, gy + 22, 15, low ? '#ffd23f' : '#ffffff')
      warnX = x0 + ctx.measureText(text).width + 12
    }
    if (low && Math.floor(this.time / 0.3) % 2 === 0) this.outlinedText(view.fuel <= 0 ? 'SLUT PÅ BRÄNSLE' : 'LITE BRÄNSLE', warnX, gy + 22, 15, '#ff6b6b')
    if (view.spec.engine.gearbox) this.drawRevGauge(view, gx + gw + 50, gy + 14)
    // Thrusters: an orange tank bar under the fuel line.
    if (view.thrust) {
      const ty = gy + 44 + (view.turbo && view.turbo > 0 ? 18 : 0)
      const bx = x0 + 64
      const bw = gx + gw - bx
      ctx.beginPath()
      ctx.roundRect(bx, ty, bw, 12, 6)
      ctx.fillStyle = 'rgba(16, 21, 28, 0.45)'
      ctx.fill()
      if (view.thrust.left > 0) {
        ctx.beginPath()
        ctx.roundRect(bx + 2, ty + 2, (bw - 4) * view.thrust.left, 8, 4)
        ctx.fillStyle = '#ff9a3c'
        ctx.fill()
      }
      this.outlinedText('RAKET', x0, ty - 2, 13, '#ffb070')
    }
    // Turbo: a blue bar under the fuel line while it lasts.
    if (view.turbo && view.turbo > 0) {
      const ty = gy + 44
      const bx = x0 + 64
      const bw = gx + gw - bx
      ctx.beginPath()
      ctx.roundRect(bx, ty, bw, 12, 6)
      ctx.fillStyle = 'rgba(16, 21, 28, 0.45)'
      ctx.fill()
      ctx.beginPath()
      ctx.roundRect(bx + 2, ty + 2, (bw - 4) * view.turbo, 8, 4)
      ctx.fillStyle = '#5aaaff'
      ctx.fill()
      this.outlinedText('TURBO', x0, ty - 2, 13, '#7fc4ff')
    }

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
    pedal(swap ? rightX : leftX, input.brake, '#ff8080', 'BROMS')
    pedal(swap ? leftX : rightX, input.gas, '#7dff9a', 'GAS')
    ctx.textBaseline = 'top'
  }
}
