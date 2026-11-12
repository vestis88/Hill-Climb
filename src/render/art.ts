import type { Hat, Outfit, Pattern } from '../data/outfits'
import type { Pickup } from '../data/track'
import type { VehicleSpec } from '../sim/types'

/** Drawing helpers for vehicles, the driver and pickups. World units (metres), y up. See STYLE.md. */
export const OUTLINE = '#1d2433'
const LINE = 0.05

/** Mix a #rrggbb colour towards black (amount < 0) or white (amount > 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount))
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Body, shadow and highlight shades for a player's paint colour. */
export const paintColours = (paint: string) => ({ body: paint, dark: shade(paint, -0.32), light: shade(paint, 0.38) })

export const VEHICLE_COLOURS: Record<string, { body: string; dark: string; light: string }> = {
  runabout: { body: '#e2542f', dark: '#a8371b', light: '#f58a62' },
  scrambler: { body: '#2fae5f', dark: '#1d7a40', light: '#6fd391' },
  hauler: { body: '#f2b632', dark: '#b98318', light: '#ffd877' },
  rover: { body: '#1fb5a8', dark: '#12796f', light: '#6fe0d4' },
  tractor: { body: '#4f9a2e', dark: '#33691c', light: '#8ccf66' },
  kart: { body: '#ff7a1a', dark: '#b8500a', light: '#ffb070' },
  snowmobile: { body: '#e8e8f0', dark: '#9aa0b0', light: '#ffffff' },
  monster: { body: '#8e44d1', dark: '#5f2a93', light: '#c08cf0' },
  lander: { body: '#dfe5ee', dark: '#8b93a1', light: '#ffffff' },
}

type Ctx = CanvasRenderingContext2D
type Pt = [number, number]

function poly(ctx: Ctx, pts: Pt[], fill: string | CanvasGradient, outline = true): void {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (outline) {
    ctx.lineWidth = LINE
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
  }
}

/** A polygon filled with a top-to-bottom gradient: light, body colour, then dark. */
function shaded(ctx: Ctx, pts: Pt[], light: string, body: string, dark: string): void {
  let top = Infinity
  let bottom = -Infinity
  for (const [, y] of pts) {
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  const g = ctx.createLinearGradient(0, bottom, 0, top)
  g.addColorStop(0, dark)
  g.addColorStop(0.45, body)
  g.addColorStop(1, light)
  poly(ctx, pts, g)
}

/** A soft glow, e.g. around headlights. */
function glow(ctx: Ctx, x: number, y: number, r: number, colour: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, colour)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, outline = true): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (outline) {
    ctx.lineWidth = LINE
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
  }
}

function tube(ctx: Ctx, pts: Pt[], width: number, colour: string): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [w, c] of [[width + LINE * 2, OUTLINE], [width, colour]] as const) {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.lineWidth = w
    ctx.strokeStyle = c
    ctx.stroke()
  }
}

/** A chunky tyre with tread, sidewall and a spoked rim, in the wheel's own frame. */
/** How a wheel is drawn: spin speed (rad/s) for motion blur, and grime on the tyre per environment. */
export interface WheelLook {
  spin?: number
  /** Colour of mud, dust or snow stuck to the tyre. */
  grime?: string
  /** Motocross wheel: thin knobbly tyre on a big wire-spoked rim. */
  mx?: boolean
  /** Balloon tyre with paddle treads (Marsh Rover). */
  paddle?: boolean
}

export function drawWheel(ctx: Ctx, radius: number, look: WheelLook = {}): void {
  if (look.mx) return drawMxWheel(ctx, radius, look)
  if (look.paddle) return drawPaddleWheel(ctx, radius, look)
  const r = radius
  // 0 when slow, 1 when spinning fast: spokes fade into a blurred disc.
  const blur = Math.min(1, Math.max(0, (Math.abs(look.spin ?? 0) - 10) / 20))
  // Tread blocks stick out past the tyre for a knobbly silhouette.
  ctx.fillStyle = OUTLINE
  for (let i = 0; i < 14; i++) {
    ctx.save()
    ctx.rotate((i / 14) * Math.PI * 2)
    ctx.beginPath()
    ctx.roundRect(r * 0.86, -r * 0.11, r * 0.2, r * 0.22, r * 0.04)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = '#2a2f38'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Sidewall ring
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2)
  ctx.lineWidth = r * 0.08
  ctx.strokeStyle = '#3d4450'
  ctx.stroke()
  // Rim with a highlight from the top
  const rim = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6)
  rim.addColorStop(0, '#8b93a1')
  rim.addColorStop(1, '#e8ecf2')
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2)
  ctx.fillStyle = rim
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2)
  ctx.fillStyle = '#5b6372'
  ctx.fill()
  // Spokes, fading into a blurred disc at speed
  ctx.strokeStyle = '#c9ced6'
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  ctx.globalAlpha = 1 - blur * 0.85
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12)
    ctx.lineTo(Math.cos(a) * r * 0.44, Math.sin(a) * r * 0.44)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  if (blur > 0) {
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(201, 206, 214, ${0.45 * blur})`
    ctx.fill()
    // Streaks around the rim
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * blur})`
    ctx.lineWidth = r * 0.05
    for (const a of [0.3, 2.4, 4.5]) {
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.68, a, a + 1.2)
      ctx.stroke()
    }
  }
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2)
  ctx.fillStyle = '#e8ecf2'
  ctx.fill()
  ctx.lineWidth = LINE * 0.8
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Mud, dust or snow caught in the tread
  if (look.grime) {
    ctx.fillStyle = look.grime
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.2
      const rr = r * (0.82 + (i % 2) * 0.1)
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.11, r * 0.07, a, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** A fat balloon tyre with chunky paddles, on a small yellow rim. */
function drawPaddleWheel(ctx: Ctx, r: number, look: WheelLook): void {
  const blur = Math.min(1, Math.max(0, (Math.abs(look.spin ?? 0) - 10) / 20))
  ctx.fillStyle = OUTLINE
  for (let i = 0; i < 10; i++) {
    ctx.save()
    ctx.rotate((i / 10) * Math.PI * 2)
    ctx.beginPath()
    ctx.moveTo(r * 0.9, -r * 0.16)
    ctx.lineTo(r * 1.12, -r * 0.05)
    ctx.lineTo(r * 1.12, r * 0.05)
    ctx.lineTo(r * 0.9, r * 0.16)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = '#30353f'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Soft sidewall bulge
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2)
  ctx.lineWidth = r * 0.12
  ctx.strokeStyle = '#3e4450'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2)
  ctx.fillStyle = '#f2b632'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  ctx.globalAlpha = 1 - blur * 0.8
  ctx.fillStyle = '#b98318'
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(Math.cos(a) * r * 0.27, Math.sin(a) * r * 0.27, r * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2)
  ctx.fillStyle = '#e8ecf2'
  ctx.fill()
  ctx.stroke()
  if (look.grime) {
    ctx.fillStyle = look.grime
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.2
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.12, r * 0.07, a, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawMxWheel(ctx: Ctx, r: number, look: WheelLook): void {
  const blur = Math.min(1, Math.max(0, (Math.abs(look.spin ?? 0) - 10) / 20))
  // Square knobs all round a thin tyre.
  ctx.fillStyle = OUTLINE
  for (let i = 0; i < 20; i++) {
    ctx.save()
    ctx.rotate((i / 20) * Math.PI * 2)
    ctx.fillRect(r * 0.9, -r * 0.07, r * 0.16, r * 0.14)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = '#2a2f38'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Rim: a thin metal hoop, with the dark gap of the wheel showing through the spokes.
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2)
  ctx.fillStyle = '#3d4450'
  ctx.fill()
  ctx.lineWidth = r * 0.09
  ctx.strokeStyle = '#d7dce4'
  ctx.stroke()
  ctx.lineWidth = LINE * 0.6
  ctx.strokeStyle = OUTLINE
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.81, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.71, 0, Math.PI * 2)
  ctx.stroke()
  // Crossed wire spokes, fading to a blur at speed.
  ctx.globalAlpha = 1 - blur * 0.8
  ctx.strokeStyle = '#c9ced6'
  ctx.lineWidth = r * 0.03
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    const lean = i % 2 ? 0.5 : -0.5
    ctx.beginPath()
    ctx.moveTo(Math.cos(a + lean) * r * 0.14, Math.sin(a + lean) * r * 0.14)
    ctx.lineTo(Math.cos(a) * r * 0.71, Math.sin(a) * r * 0.71)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  if (blur > 0) {
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.71, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(201, 206, 214, ${0.35 * blur})`
    ctx.fill()
  }
  // Brake disc and hub.
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2)
  ctx.lineWidth = r * 0.07
  ctx.strokeStyle = '#9aa2ae'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2)
  ctx.fillStyle = '#b8bfca'
  ctx.fill()
  ctx.lineWidth = LINE * 0.8
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  if (look.grime) {
    ctx.fillStyle = look.grime
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.2
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, r * 0.1, r * 0.06, a, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Pip's helmeted head, centred on the origin, facing +x: shaded helmet, eyes behind the visor. */
/** Pip's face: a grin on jumps and stunts, wide eyes when tipping over. */
export type Mood = 'normal' | 'happy' | 'worried'

/**
 * The outfit drawn on the next heads (set by the renderer before each vehicle): helmet colour,
 * pattern and hat (data/outfits.ts). Null is Pip's own teal helmet with a white stripe.
 */
let outfit: Outfit | null = null
/** Whether the next vehicle's thrusters are firing (the Moon Lander), set by the renderer. */
let thrusting = false
export function setThrusting(on: boolean): void {
  thrusting = on
}
export function setOutfit(o: Outfit | null): void {
  outfit = o
}

export function drawHead(ctx: Ctx, r: number, mood: Mood = 'normal'): void {
  // An open-face helmet: the shell over the top and back, the face showing at the front (+x).
  const helmet = ctx.createLinearGradient(0, -r, 0, r)
  const hc = outfit ? paintColours(outfit.colour) : { dark: '#0e7779', light: '#2cc6c8' }
  helmet.addColorStop(0, hc.dark)
  helmet.addColorStop(1, hc.light)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = helmet
  ctx.fill()
  drawPattern(ctx, r, outfit?.pattern ?? 'stripe')
  // The face, cut out of the front of the helmet.
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2)
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(r * 0.48, -r * 0.12, r * 0.62, r * 0.6, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#ffd9b8'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Cheek
  ctx.beginPath()
  ctx.ellipse(r * 0.42, -r * 0.3, r * 0.13, r * 0.08, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 130, 120, 0.45)'
  ctx.fill()
  ctx.restore()
  // Helmet rim around the face, and the outline.
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Visor peak over the forehead.
  ctx.beginPath()
  ctx.moveTo(r * 0.05, r * 0.5)
  ctx.quadraticCurveTo(r * 0.75, r * 0.62, r * 1.18, r * 0.42)
  ctx.lineTo(r * 1.1, r * 0.3)
  ctx.quadraticCurveTo(r * 0.7, r * 0.45, r * 0.1, r * 0.38)
  ctx.closePath()
  ctx.fillStyle = hc.dark
  ctx.fill()
  ctx.stroke()
  // Eyes: the near one bigger; pupils look ahead.
  ctx.lineCap = 'round'
  for (const [ex, size] of [[0.42, 1], [0.78, 0.8]] as const) {
    const ey = r * 0.08
    const w = r * 0.11 * size
    const h = r * 0.15 * size
    if (mood === 'happy') {
      // Squinting with joy: upturned arcs.
      ctx.beginPath()
      ctx.arc(r * ex, ey - h * 0.3, w, Math.PI * 0.15, Math.PI * 0.85)
      ctx.lineWidth = r * 0.07
      ctx.strokeStyle = OUTLINE
      ctx.stroke()
      continue
    }
    const big = mood === 'worried' ? 1.25 : 1
    ctx.beginPath()
    ctx.ellipse(r * ex, ey, w * big, h * big, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = r * 0.035
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(r * ex + w * 0.35, ey - (mood === 'worried' ? 0 : h * 0.15), w * (mood === 'worried' ? 0.4 : 0.6), 0, Math.PI * 2)
    ctx.fillStyle = OUTLINE
    ctx.fill()
    // Eyebrow
    ctx.beginPath()
    const by = ey + h * big + r * 0.08
    if (mood === 'worried') {
      ctx.moveTo(r * ex - w, by - r * 0.05)
      ctx.lineTo(r * ex + w, by + r * 0.04)
    } else {
      ctx.moveTo(r * ex - w, by)
      ctx.quadraticCurveTo(r * ex, by + r * 0.04, r * ex + w, by)
    }
    ctx.lineWidth = r * 0.045
    ctx.stroke()
  }
  // Nose: a small bump at the front of the face.
  ctx.beginPath()
  ctx.ellipse(r * 1.0, -r * 0.08, r * 0.09, r * 0.07, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#f5bf98'
  ctx.fill()
  ctx.lineWidth = r * 0.03
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Mouth
  ctx.beginPath()
  if (mood === 'happy') {
    // A big open grin.
    ctx.moveTo(r * 0.42, -r * 0.3)
    ctx.quadraticCurveTo(r * 0.68, -r * 0.62, r * 0.92, -r * 0.3)
    ctx.closePath()
    ctx.fillStyle = '#8a2a2a'
    ctx.fill()
    ctx.lineWidth = r * 0.04
    ctx.stroke()
  } else if (mood === 'worried') {
    ctx.ellipse(r * 0.7, -r * 0.38, r * 0.07, r * 0.09, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#8a2a2a'
    ctx.fill()
    ctx.lineWidth = r * 0.035
    ctx.stroke()
  } else {
    ctx.moveTo(r * 0.52, -r * 0.33)
    ctx.quadraticCurveTo(r * 0.7, -r * 0.43, r * 0.88, -r * 0.31)
    ctx.lineWidth = r * 0.045
    ctx.stroke()
  }
  // Shine on the helmet
  ctx.beginPath()
  ctx.ellipse(-r * 0.4, r * 0.48, r * 0.22, r * 0.11, -0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fill()
  if (outfit && outfit.hat !== 'none') drawHat(ctx, r, outfit.hat)
}

/** A helmet pattern over the top and back of the helmet (the visor side stays clear). */
function drawPattern(ctx: Ctx, r: number, pattern: Pattern): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2)
  ctx.clip()
  // Only on the shell: the back and the top, not where the face is.
  ctx.beginPath()
  ctx.rect(-r, -r, r * 1.05, r * 2)
  ctx.rect(-r, r * 0.45, r * 2, r)
  ctx.clip()
  if (pattern === 'stripe') {
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.82, Math.PI * 0.35, Math.PI * 0.75)
    ctx.lineWidth = r * 0.16
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  } else if (pattern === 'stars') {
    ctx.fillStyle = '#fff6c8'
    for (const [x, y, s] of [[-0.45, 0.45, 0.2], [0.05, 0.72, 0.16], [-0.7, -0.05, 0.15], [-0.25, 0.05, 0.12]] as const) star(ctx, x * r, y * r, s * r)
  } else if (pattern === 'goldstars') {
    ctx.fillStyle = '#ffcf33'
    for (const [x, y, s] of [[-0.45, 0.45, 0.26], [0.05, 0.72, 0.2], [-0.72, -0.05, 0.2], [-0.25, 0.02, 0.15]] as const) star(ctx, x * r, y * r, s * r)
  } else if (pattern === 'checks') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    const s = r * 0.28
    for (let i = -4; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0 && i * s < r * 0.1) ctx.fillRect(i * s, j * s, s, s)
  } else if (pattern === 'flames') {
    ctx.fillStyle = '#ffb020'
    ctx.beginPath()
    ctx.moveTo(-r, -r * 0.3)
    for (let i = 0; i < 4; i++) {
      const y = -r * 0.3 + i * r * 0.3
      ctx.quadraticCurveTo(-r * 0.2, y + r * 0.05, r * (0.05 - i * 0.12), y + r * 0.22)
      ctx.quadraticCurveTo(-r * 0.4, y + r * 0.2, -r, y + r * 0.3)
    }
    ctx.fill()
  }
  ctx.restore()
}

function star(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? s * 0.45 : s
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

/** A hat on top of the helmet (head coordinates, y up). */
function drawHat(ctx: Ctx, r: number, hat: Hat): void {
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  if (hat === 'cap') {
    shaded(ctx, [[-r * 0.85, r * 0.55], [r * 0.6, r * 0.75], [r * 0.5, r * 1.15], [-r * 0.7, r * 1.1]], '#ff6b6b', '#e5383b', '#a8261f')
    poly(ctx, [[r * 0.45, r * 0.72], [r * 1.25, r * 0.66], [r * 1.2, r * 0.78], [r * 0.45, r * 0.86]], '#a8261f')
  } else if (hat === 'cowboy') {
    poly(ctx, [[-r * 1.3, r * 0.7], [r * 1.3, r * 0.82], [r * 1.25, r * 0.95], [-r * 1.35, r * 0.85]], '#8a5a33')
    shaded(ctx, [[-r * 0.7, r * 0.8], [r * 0.7, r * 0.88], [r * 0.6, r * 1.55], [-r * 0.65, r * 1.5]], '#c99a64', '#a5672f', '#6e4325')
    poly(ctx, [[-r * 0.68, r * 0.95], [r * 0.68, r * 1.02], [r * 0.67, r * 1.12], [-r * 0.68, r * 1.06]], '#3d2a1a', false)
  } else if (hat === 'santa') {
    poly(ctx, [[-r * 0.85, r * 0.6], [r * 0.75, r * 0.7], [r * 0.1, r * 1.6], [-r * 0.9, r * 1.45]], '#e5383b')
    rrect(ctx, -r * 0.95, r * 0.5, r * 1.8, r * 0.28, r * 0.12, '#ffffff')
    ctx.beginPath()
    ctx.arc(-r * 0.95, r * 1.45, r * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.stroke()
  } else if (hat === 'viking') {
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(side * r * 0.55, r * 0.7)
      ctx.quadraticCurveTo(side * r * 1.35, r * 0.9, side * r * 1.25, r * 1.6)
      ctx.quadraticCurveTo(side * r * 1.05, r * 1.05, side * r * 0.4, r * 0.95)
      ctx.closePath()
      ctx.fillStyle = '#f2ead8'
      ctx.fill()
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(0, r * 0.45, r * 0.62, Math.PI * 0.1, Math.PI * 0.9)
    ctx.lineWidth = r * 0.22
    ctx.strokeStyle = '#b8bfca'
    ctx.stroke()
  } else if (hat === 'crown') {
    const pts: Pt[] = [[-r * 0.65, r * 0.7], [r * 0.65, r * 0.7], [r * 0.75, r * 1.4], [r * 0.38, r * 1.1], [0, r * 1.5], [-r * 0.38, r * 1.1], [-r * 0.75, r * 1.4]]
    shaded(ctx, pts, '#ffe680', '#ffcf33', '#c98a00')
    for (const x of [-0.38, 0, 0.38]) {
      ctx.beginPath()
      ctx.arc(x * r, r * 0.85, r * 0.08, 0, Math.PI * 2)
      ctx.fillStyle = x === 0 ? '#e5383b' : '#4c97f5'
      ctx.fill()
    }
  }
}

/** Pip's body from the seat (origin) up the y axis, with the head on top. */
export function drawDriver(ctx: Ctx, headRadius: number, torso: number, hands?: Pt, mood: Mood = 'normal', foot?: Pt): void {
  const neck = torso - headRadius - 0.04
  const hip: Pt = [0, 0.1]
  const jacket = '#2f5fae'
  const jacketDark = '#22457f'
  const trousers = '#3a3f52'
  // Leg (the near one): thigh forward to a bent knee, shin down to a boot on the pedal or peg.
  if (foot) {
    const knee: Pt = [foot[0] * 0.65 + 0.06, Math.max(foot[1] + 0.3, hip[1] + 0.12)]
    tube(ctx, [hip, knee], 0.16, trousers)
    tube(ctx, [knee, [foot[0], foot[1] + 0.06]], 0.13, trousers)
    ctx.beginPath()
    ctx.roundRect(foot[0] - 0.07, foot[1] - 0.05, 0.22, 0.1, 0.04)
    ctx.fillStyle = '#2a2f38'
    ctx.fill()
    ctx.lineWidth = LINE * 0.8
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
  }
  // Torso: a jacket that widens at the shoulders, leaning a little forward.
  const shoulderY = neck - 0.05
  shaded(ctx, [[-0.16, 0.02], [0.14, 0.02], [0.18, shoulderY - 0.06], [0.1, shoulderY + 0.04], [-0.12, shoulderY + 0.04], [-0.2, shoulderY - 0.08]], '#4f7fcc', jacket, jacketDark)
  // Zip line and a number badge on the chest
  tube(ctx, [[0.1, 0.06], [0.13, shoulderY - 0.04]], 0.02, jacketDark)
  // Arm: shoulder, elbow, glove on the bars or wheel.
  const shoulder: Pt = [0.03, shoulderY - 0.02]
  const hand: Pt = hands ?? [0.4, torso * 0.45]
  const elbow: Pt = [(shoulder[0] + hand[0]) / 2 - 0.04, Math.min(shoulder[1], hand[1]) - 0.08]
  tube(ctx, [shoulder, elbow], 0.12, jacket)
  tube(ctx, [elbow, hand], 0.1, jacket)
  ctx.beginPath()
  ctx.arc(hand[0], hand[1], 0.07, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = LINE * 0.8
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Neck scarf (just around the neck).
  tube(ctx, [[-0.1, neck + 0.01], [0.12, neck + 0.03]], 0.09, '#ff8a2a')
  ctx.save()
  ctx.translate(0, torso)
  drawHead(ctx, headRadius, mood)
  ctx.restore()
}

/** A coil spring between two points, drawn as a zigzag with an outline. */
function coil(ctx: Ctx, from: Pt, to: Pt, turns: number, width: number, colour: string): void {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [lw, col] of [[0.075, OUTLINE], [0.04, colour]] as const) {
    ctx.beginPath()
    ctx.moveTo(from[0], from[1])
    for (let k = 1; k < turns * 2; k++) {
      const t = k / (turns * 2)
      const side = k % 2 ? width : -width
      ctx.lineTo(from[0] + dx * t + nx * side, from[1] + dy * t + ny * side)
    }
    ctx.lineTo(to[0], to[1])
    ctx.lineWidth = lw
    ctx.strokeStyle = col
    ctx.stroke()
  }
}

/**
 * Two-stroke motocross bike, facing +x: high mudguards, number plates, radiator shrouds, a fat
 * expansion chamber, upside-down fork and a linked rear shock. The swingarm, shock and fork
 * follow the wheel hubs (chassis coordinates), so the suspension visibly works. Both mudguards
 * sit above the tyre at full bump-stop travel (data/vehicles.ts), so a wheel never goes through.
 */
function drawMotocross(ctx: Ctx, spec: VehicleSpec, c: { body: string; dark: string; light: string }, hubs?: Pt[]): void {
  const [rear, front] = hubs ?? spec.wheels.map((w): Pt => [w.anchor.x, w.anchor.y])
  const pivot: Pt = MX_PIVOT
  const along = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]

  // Rear shock, upright behind the engine, onto a linkage under the swingarm.
  coil(ctx, [-0.24, 0.4], along(pivot, rear, 0.3), 6, 0.065, '#ff8a2a')
  // Chain and sprockets, then the tapered aluminium swingarm.
  ctx.beginPath()
  ctx.arc(rear[0], rear[1], 0.13, 0, Math.PI * 2)
  ctx.fillStyle = '#3d4450'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  tube(ctx, [[-0.02, -0.04], [rear[0], rear[1] + 0.13]], 0.025, '#2a2f38')
  tube(ctx, [[-0.02, -0.15], [rear[0], rear[1] - 0.13]], 0.025, '#2a2f38')
  const ax = rear[0] - pivot[0]
  const ay = rear[1] - pivot[1]
  const al = Math.hypot(ax, ay) || 1
  const [nx, ny] = [-ay / al, ax / al]
  poly(ctx, [
    [pivot[0] + nx * 0.08, pivot[1] + ny * 0.08],
    [rear[0] + nx * 0.045, rear[1] + ny * 0.045],
    [rear[0] - nx * 0.045, rear[1] - ny * 0.045],
    [pivot[0] - nx * 0.08, pivot[1] - ny * 0.08],
  ], '#c9ced6')
  tube(ctx, [along(pivot, rear, 0.15), along(pivot, rear, 0.85)], 0.012, '#8b93a1')
  rrect(ctx, rear[0] - 0.05, rear[1] - 0.05, 0.1, 0.1, 0.025, '#8b93a1')

  // Frame: twin spar from the steering head to the swingarm pivot, cradle and subframe.
  tube(ctx, [[0.42, 0.52], [0.05, 0.3], [pivot[0], pivot[1]]], 0.1, '#b8bfca')
  tube(ctx, [[0.44, 0.44], [0.3, -0.1], [0.1, -0.24], [-0.1, -0.2]], 0.05, '#b8bfca')
  tube(ctx, [[-0.02, 0.34], [-0.91, 0.45]], 0.045, '#8b93a1')
  rrect(ctx, pivot[0] - 0.05, pivot[1] - 0.05, 0.1, 0.1, 0.05, '#5b6372')

  // Engine: a compact single, with crankcase, clutch cover and a finned cylinder leaning forward.
  rrect(ctx, -0.1, -0.22, 0.3, 0.19, 0.06, '#5b6372')
  ctx.beginPath()
  ctx.arc(0.02, -0.13, 0.065, 0, Math.PI * 2)
  ctx.fillStyle = '#8b93a1'
  ctx.fill()
  ctx.stroke()
  poly(ctx, [[0.07, -0.04], [0.2, -0.04], [0.25, 0.14], [0.11, 0.15]], '#8b93a1')
  for (let i = 0; i < 3; i++) {
    const y = 0.0 + i * 0.045
    tube(ctx, [[0.07 + y * 0.28, y], [0.21 + y * 0.28, y]], 0.014, '#5b6372')
  }
  rrect(ctx, 0.1, 0.13, 0.16, 0.045, 0.02, '#3d4450')

  // Expansion chamber: out of the front of the cylinder, down, a fat belly under the engine,
  // tapering back up to the silencer under the side panel.
  const pipe: [Pt, number][] = [
    [[0.22, 0.05], 0.045], [[0.33, 0.0], 0.055], [[0.37, -0.1], 0.07], [[0.28, -0.2], 0.085],
    [[0.1, -0.25], 0.09], [[-0.08, -0.23], 0.075], [[-0.24, -0.12], 0.06], [[-0.37, 0.07], 0.05], [[-0.46, 0.24], 0.045],
  ]
  for (const [w, col] of [[LINE * 2, OUTLINE], [0, '#6b7380'], [-0.06, '#9aa2ae']] as const) {
    ctx.lineCap = 'round'
    ctx.strokeStyle = col
    for (let i = 1; i < pipe.length; i++) {
      ctx.beginPath()
      ctx.moveTo(pipe[i - 1][0][0], pipe[i - 1][0][1] + (w < 0 ? 0.025 : 0))
      ctx.lineTo(pipe[i][0][0], pipe[i][0][1] + (w < 0 ? 0.025 : 0))
      ctx.lineWidth = Math.max(0.02, (pipe[i - 1][1] + pipe[i][1]) / 2 + w)
      ctx.stroke()
    }
  }
  // Silencer
  tube(ctx, [[-0.46, 0.25], [-1.04, 0.38]], 0.11, '#d7dce4')
  tube(ctx, [[-1.04, 0.38], [-1.1, 0.39]], 0.06, '#3d4450')

  // Rear mudguard: long and swept up behind the seat. Its underside stays above 0.4 over the
  // tyre (the tyre top reaches 0.30 at full travel).
  // Same length as before; it moves back with the rear wheel.
  const rf = spec.wheels[0].anchor.x + 0.78
  shaded(ctx, [[-0.3 + rf, 0.42], [-0.7 + rf, 0.41], [-1.08 + rf, 0.44], [-1.36 + rf, 0.56], [-1.3 + rf, 0.62], [-0.95 + rf, 0.54], [-0.3 + rf, 0.52]], c.light, c.body, c.dark)
  // Side panel with the number plate.
  poly(ctx, [[-0.66, 0.28], [-0.2, 0.25], [-0.12, 0.46], [-0.72, 0.48]], '#ffffff')
  number(ctx, -0.42, 0.37, 0.17)
  // Seat: long and flat, running up onto the tank.
  poly(ctx, [[-1.0, 0.47], [0.0, 0.49], [0.16, 0.58], [0.02, 0.6], [-0.96, 0.57]], '#2a2f38')
  // Tank and radiator shroud, with a stripe.
  shaded(ctx, [[-0.02, 0.5], [0.42, 0.55], [0.56, 0.36], [0.44, 0.1], [0.24, 0.12], [0.1, 0.32]], c.light, c.body, c.dark)
  poly(ctx, [[0.16, 0.36], [0.5, 0.34], [0.46, 0.27], [0.14, 0.29]], '#ffffff', false)

  // Front mudguard, high on the bottom fork clamp (fixed to the chassis), arched over the
  // tyre: underside 0.43 over the hub, above the tyre top at full travel (0.32 with knobs).
  const fh = spec.wheels[1].anchor.x
  shaded(ctx, [
    [fh - 0.34, 0.34], [fh - 0.16, 0.41], [fh, 0.43], [fh + 0.2, 0.41], [fh + 0.42, 0.35],
    [fh + 0.45, 0.39], [fh + 0.2, 0.47], [fh, 0.49], [fh - 0.16, 0.47], [fh - 0.34, 0.39],
  ], c.light, c.body, c.dark)

  // Upside-down fork: gold inner legs at the axle slide up into the big outer tubes held in
  // the clamps, so the fork visibly shortens as the front wheel rises.
  // The clamps sit on the fork's line (the front wheel's axis), so the hub slides straight along it.
  const fa = spec.wheels[1].axis ?? { x: 0, y: 1 }
  const clamp: Pt = [spec.wheels[1].anchor.x + fa.x * 1.26, spec.wheels[1].anchor.y + fa.y * 1.26]
  const fx = front[0] - clamp[0]
  const fy = front[1] - clamp[1]
  const fl = Math.hypot(fx, fy) || 1
  const outer = Math.min(0.58, fl - 0.12)
  tube(ctx, [front, clamp], 0.07, '#f2b632')
  tube(ctx, [clamp, [clamp[0] + (fx / fl) * outer, clamp[1] + (fy / fl) * outer]], 0.11, '#3d4450')
  tube(ctx, [[clamp[0] + (fx / fl) * 0.05, clamp[1] + (fy / fl) * 0.05], [clamp[0] + (fx / fl) * (outer - 0.04), clamp[1] + (fy / fl) * (outer - 0.04)]], 0.025, '#8b93a1')
  rrect(ctx, front[0] - 0.055, front[1] - 0.055, 0.11, 0.13, 0.03, '#8b93a1')
  // Clamps, front number plate and handlebar.
  rrect(ctx, 0.3, 0.7, 0.16, 0.06, 0.02, '#b8bfca')
  rrect(ctx, 0.38, 0.46, 0.16, 0.06, 0.02, '#b8bfca')
  poly(ctx, [[0.44, 0.48], [0.6, 0.52], [0.52, 0.84], [0.38, 0.8]], '#ffffff')
  number(ctx, 0.49, 0.66, 0.15)
  tube(ctx, [[0.34, 0.76], [0.32, 0.86], [0.26, 0.86]], 0.04, '#2a2f38')
}

/** The bike's swingarm pivot, chassis coordinates. */
const MX_PIVOT: Pt = [-0.12, -0.02]

/**
 * Where to draw each wheel hub (chassis coordinates). The physics moves the bike's rear hub
 * along a straight line across the swingarm; drawn, it sits on the swingarm's arc so the arm
 * keeps its length. Other hubs are drawn where the physics has them.
 */
export function drawnHubs(spec: VehicleSpec, hubs: Pt[]): Pt[] {
  if (spec.id !== 'scrambler') return hubs
  return hubs.map((h, i) => {
    const w = spec.wheels[i]
    if (w.axle !== 'rear' || !w.axis) return h
    // Arm length at mid travel.
    const mid = (((w.travel?.up ?? 0) - (w.travel?.down ?? 0)) / 2)
    const L = Math.hypot(w.anchor.x + w.axis.x * mid - MX_PIVOT[0], w.anchor.y + w.axis.y * mid - MX_PIVOT[1])
    const dx = h[0] - MX_PIVOT[0]
    const dy = h[1] - MX_PIVOT[1]
    const d = Math.hypot(dx, dy) || 1
    return [MX_PIVOT[0] + (dx / d) * L, MX_PIVOT[1] + (dy / d) * L]
  })
}

/** The rider's race number, centred on (x, y), in chassis coordinates (y up). */
function number(ctx: Ctx, x: number, y: number, size: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, -1)
  ctx.font = `900 ${size}px ui-rounded, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = OUTLINE
  ctx.fillText('7', 0, size * 0.05)
  ctx.restore()
}

/**
 * The vehicle body in chassis coordinates, with the seated driver drawn at `lean`
 * unless the driver has been thrown out (ragdoll). `hubs` are the wheel centres in chassis
 * coordinates, for parts that follow the suspension; they default to the wheel anchors.
 */
export function drawVehicle(ctx: Ctx, spec: VehicleSpec, lean: number, withDriver: boolean, mood: Mood = 'normal', hubs?: Pt[], paint?: string): void {
  // A player's own paint colour (their name colour), else the vehicle's factory colours.
  const c = paint ? paintColours(paint) : (VEHICLE_COLOURS[spec.id] ?? VEHICLE_COLOURS.runabout)
  const { head, headRadius } = spec.driver
  const seat: Pt = [head.x, head.y - 0.75]
  // Where Pip's feet rest, relative to the seat: pedals in the cars, the footpeg on the bike.
  const feet: Record<string, Pt> = { runabout: [0.55, -0.2], scrambler: [0.1, -0.46], hauler: [0.55, -0.25], rover: [0.5, -0.25], tractor: [0.55, -0.47], monster: [0.55, -0.25], kart: [0.7, -0.05], snowmobile: [0.35, -0.35], lander: [0.5, -0.25] }
  const driver = (hands?: Pt) => {
    if (!withDriver) return
    ctx.save()
    ctx.translate(seat[0], seat[1])
    ctx.rotate(lean)
    drawDriver(ctx, headRadius, 0.75, hands, mood, feet[spec.id])
    ctx.restore()
  }

  if (spec.id === 'scrambler') {
    drawMotocross(ctx, spec, c, hubs)
    driver([0.48, 0.84 - seat[1]])
    return
  }

  if (spec.id === 'rover') {
    // Marsh Rover: a little amphibious boat-buggy with a snorkel exhaust and float bumpers.
    tube(ctx, [[-1.0, 0.3], [-1.08, 1.0], [-0.9, 1.08]], 0.1, '#5b6372')
    tube(ctx, [[-0.95, 0.35], [-0.75, 1.05], [-0.35, 1.05]], 0.08, '#b8bfca')
    driver([0.62, 0.62 - seat[1]])
    shaded(ctx, [[-1.3, -0.15], [1.2, -0.15], [1.5, 0.22], [0.6, 0.38], [-0.95, 0.38], [-1.4, 0.2]], c.light, c.body, c.dark)
    // Waterline stripe and rivets
    poly(ctx, [[-1.32, 0.02], [1.32, 0.02], [1.38, 0.1], [-1.36, 0.1]], 'rgba(255,255,255,0.85)', false)
    for (let i = 0; i < 6; i++) rrect(ctx, -1.0 + i * 0.4, 0.22, 0.05, 0.05, 0.025, c.dark, false)
    // Float bumpers front and back
    rrect(ctx, 1.35, -0.12, 0.3, 0.24, 0.12, '#ff8a2a')
    rrect(ctx, -1.6, -0.08, 0.28, 0.22, 0.11, '#ff8a2a')
    // Handlebar, headlight
    tube(ctx, [[0.45, 0.38], [0.6, 0.66], [0.7, 0.66]], 0.05, '#2a2f38')
    glow(ctx, 1.42, 0.2, 0.5, 'rgba(255, 240, 170, 0.5)')
    rrect(ctx, 1.3, 0.14, 0.14, 0.12, 0.05, '#fff6c8')
    return
  }

  if (spec.id === 'lander') {
    // Moon lander: a white buggy with a gold foil band, an antenna dish and two thruster nozzles
    // underneath that flame while boosting.
    for (const nx of [-0.6, 0.6]) {
      if (thrusting) {
        const len = 0.7 + Math.random() * 0.35
        poly(ctx, [[nx - 0.16, -0.32], [nx + 0.16, -0.32], [nx, -0.32 - len]], 'rgba(255, 170, 60, 0.9)', false)
        poly(ctx, [[nx - 0.08, -0.32], [nx + 0.08, -0.32], [nx, -0.32 - len * 0.6]], 'rgba(255, 245, 190, 0.95)', false)
      }
      poly(ctx, [[nx - 0.14, -0.18], [nx + 0.14, -0.18], [nx + 0.2, -0.34], [nx - 0.2, -0.34]], '#5b6372')
    }
    tube(ctx, [[-0.95, 0.45], [-1.05, 1.2]], 0.04, '#b8bfca')
    ctx.beginPath()
    ctx.ellipse(-1.05, 1.25, 0.22, 0.1, -0.4, 0, Math.PI * 2)
    ctx.fillStyle = '#dfe5ee'
    ctx.fill()
    ctx.lineWidth = LINE
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    driver([0.6, 0.62 - seat[1]])
    shaded(ctx, [[-1.2, -0.2], [1.2, -0.2], [1.3, 0.25], [0.3, 0.5], [-1.0, 0.45], [-1.3, 0.2]], c.light, c.body, c.dark)
    poly(ctx, [[-1.22, -0.05], [1.24, -0.05], [1.27, 0.08], [-1.27, 0.08]], '#e8b33c', false)
    tube(ctx, [[0.3, 0.48], [0.5, 0.7], [0.62, 0.68]], 0.05, '#2a2f38')
    glow(ctx, 1.3, 0.15, 0.6, 'rgba(255, 240, 170, 0.55)')
    rrect(ctx, 1.18, 0.1, 0.14, 0.12, 0.04, '#fff6c8')
    return
  }

  if (spec.id === 'kart') {
    // Go-kart: a low tub with side pods, an engine at the back and a bumper at the front.
    rrect(ctx, -1.15, -0.05, 0.4, 0.28, 0.08, '#5b6372')
    tube(ctx, [[-1.0, 0.25], [-1.0, 0.5]], 0.06, '#b8bfca')
    driver([0.55, 0.42 - seat[1]])
    shaded(ctx, [[-1.05, -0.12], [1.15, -0.12], [1.2, 0.05], [0.4, 0.18], [-0.6, 0.2], [-1.1, 0.12]], c.light, c.body, c.dark)
    tube(ctx, [[0.25, 0.15], [0.45, 0.42]], 0.05, '#2a2f38')
    tube(ctx, [[0.35, 0.45], [0.55, 0.38]], 0.06, '#2a2f38')
    poly(ctx, [[-0.6, 0.02], [0.9, -0.02], [0.92, 0.04], [-0.6, 0.08]], 'rgba(255,255,255,0.85)', false)
    rrect(ctx, 1.12, -0.18, 0.22, 0.14, 0.05, '#3d4450')
    rrect(ctx, -1.32, -0.12, 0.2, 0.14, 0.05, '#3d4450')
    return
  }

  if (spec.id === 'snowmobile') {
    // Snowmobile: a track around the bogie wheels, a ski in front, a cowling with a windscreen.
    const h = hubs ?? spec.wheels.map((w) => [w.anchor.x, w.anchor.y] as Pt)
    const rear = h.slice(0, 4)
    const ski = h[4]
    const r = spec.wheels[0].radius
    ctx.beginPath()
    ctx.roundRect(rear[0][0] - r - 0.04, Math.min(...rear.map((p) => p[1])) - r - 0.04, rear[3][0] - rear[0][0] + 2 * r + 0.08, 2 * r + 0.08, r + 0.04)
    ctx.lineWidth = 0.1
    ctx.strokeStyle = '#2a2f38'
    ctx.stroke()
    ctx.lineWidth = LINE
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    tube(ctx, [[ski[0] - 0.1, ski[1] + 0.05], [ski[0] - 0.05, -0.1]], 0.07, '#5b6372')
    poly(ctx, [[ski[0] - 0.45, ski[1] - 0.2], [ski[0] + 0.35, ski[1] - 0.2], [ski[0] + 0.55, ski[1] - 0.02], [ski[0] + 0.45, ski[1] - 0.06], [ski[0] + 0.3, ski[1] - 0.12], [ski[0] - 0.45, ski[1] - 0.12]], '#2a2f38')
    driver([0.55, 0.62 - seat[1]])
    shaded(ctx, [[-1.3, -0.15], [1.1, -0.15], [1.45, 0.25], [0.4, 0.45], [-0.2, 0.42], [-1.3, 0.3]], c.light, c.body, c.dark)
    poly(ctx, [[0.45, 0.42], [0.8, 0.38], [0.6, 0.85], [0.5, 0.85]], 'rgba(190, 230, 255, 0.7)')
    tube(ctx, [[0.35, 0.45], [0.5, 0.65], [0.62, 0.62]], 0.05, '#2a2f38')
    poly(ctx, [[0.2, 0.0], [1.3, 0.05], [1.36, 0.14], [0.2, 0.1]], '#e5383b', false)
    rrect(ctx, -1.25, 0.28, 0.9, 0.16, 0.07, '#2a2f38')
    glow(ctx, 1.42, 0.18, 0.6, 'rgba(255, 240, 170, 0.55)')
    rrect(ctx, 1.3, 0.12, 0.14, 0.12, 0.04, '#fff6c8')
    return
  }

  if (spec.id === 'tractor') {
    // Tractor: a long bonnet over the engine at the front, the seat high over the big rear axle
    // with a mudguard arching over the rear wheel, a roll frame over the seat and an exhaust stack.
    // The big rear wheel stays in full view below the mudguard.
    const rear = (hubs ?? [[spec.wheels[0].anchor.x, spec.wheels[0].anchor.y]])[0]
    const rr = spec.wheels[0].radius
    // Roll frame (behind the driver)
    tube(ctx, [[-1.0, 0.45], [-1.0, 1.95], [0.0, 1.95], [0.0, 0.62]], 0.08, '#2a2f38')
    // Chassis rail joining the axles, under everything
    tube(ctx, [[-0.05, 0.05], [1.3, -0.25]], 0.16, '#3d4450')
    // Seat on a post over the rear axle, the driver on it
    tube(ctx, [[-0.45, 0.25], [-0.45, 0.52]], 0.08, '#3d4450')
    rrect(ctx, -0.72, 0.52, 0.55, 0.12, 0.05, '#2a2f38')
    tube(ctx, [[-0.7, 0.58], [-0.78, 1.0]], 0.1, '#2a2f38')
    // Footplate the boots rest on
    rrect(ctx, -0.1, 0.06, 0.5, 0.07, 0.03, '#3d4450')
    driver([0.75, 1.0 - seat[1]])
    // Mudguard: an arc over the rear wheel, open underneath.
    ctx.beginPath()
    ctx.arc(rear[0], rear[1], rr + 0.14, Math.PI * 0.08, Math.PI * 0.92)
    ctx.lineWidth = 0.16
    ctx.strokeStyle = c.dark
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.lineWidth = LINE
    ctx.strokeStyle = OUTLINE
    // Bonnet over the engine, sloping down to the grille at the front.
    shaded(ctx, [[0.0, 0.05], [1.5, 0.0], [1.62, 0.12], [1.55, 0.62], [0.05, 0.72]], c.light, c.body, c.dark)
    // Engine side vents and the grille
    for (let i = 0; i < 3; i++) tube(ctx, [[0.45 + i * 0.22, 0.2], [0.55 + i * 0.22, 0.52]], 0.035, c.dark)
    rrect(ctx, 1.48, 0.12, 0.12, 0.44, 0.04, '#2a2f38')
    // Steering wheel on its column
    tube(ctx, [[0.05, 0.7], [0.3, 1.0]], 0.05, '#2a2f38')
    tube(ctx, [[0.2, 1.08], [0.42, 0.92]], 0.06, '#2a2f38')
    // Exhaust stack with a flap
    tube(ctx, [[0.95, 0.68], [0.95, 1.35]], 0.09, '#5b6372')
    rrect(ctx, 0.86, 1.32, 0.18, 0.07, 0.03, '#2a2f38')
    glow(ctx, 1.6, 0.45, 0.6, 'rgba(255, 240, 170, 0.5)')
    rrect(ctx, 1.52, 0.4, 0.12, 0.14, 0.04, '#fff6c8')
    return
  }

  if (spec.id === 'monster') {
    // Monster truck: a pickup body high on a tube frame, with shocks down to the giant wheels.
    const h = hubs ?? spec.wheels.map((w) => [w.anchor.x, w.anchor.y] as Pt)
    for (const [hx, hy] of h) {
      tube(ctx, [[hx * 0.85, -0.15], [hx, hy + 0.2]], 0.12, '#b8bfca')
      tube(ctx, [[hx * 0.6, -0.15], [hx, hy]], 0.07, '#5b6372')
    }
    tube(ctx, [[-1.6, -0.2], [1.6, -0.2]], 0.1, '#5b6372')
    shaded(ctx, [[-1.75, -0.12], [1.75, -0.12], [1.8, 0.35], [0.85, 0.45], [0.5, 1.05], [-0.6, 1.05], [-0.7, 0.45], [-1.8, 0.4]], c.light, c.body, c.dark)
    const glass: Pt[] = [[-0.5, 0.5], [0.72, 0.5], [0.45, 0.95], [-0.5, 0.95]]
    poly(ctx, glass, '#bfe3f7')
    ctx.save()
    ctx.beginPath()
    glass.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.clip()
    driver([0.55, 0.45 - seat[1]])
    ctx.restore()
    poly(ctx, glass, 'rgba(0,0,0,0)')
    // Flame stripes along the side, light bar on the roof
    for (let i = 0; i < 4; i++) poly(ctx, [[0.9 - i * 0.5, 0.05], [1.35 - i * 0.5, 0.15], [0.9 - i * 0.5, 0.25]], '#ffb020', false)
    rrect(ctx, -0.45, 1.05, 0.8, 0.1, 0.04, '#2a2f38')
    for (let i = 0; i < 4; i++) rrect(ctx, -0.4 + i * 0.2, 1.07, 0.12, 0.06, 0.02, '#fff6c8', false)
    glow(ctx, 1.75, 0.2, 0.7, 'rgba(255, 240, 170, 0.55)')
    rrect(ctx, 1.62, 0.12, 0.16, 0.16, 0.05, '#fff6c8')
    rrect(ctx, -1.84, 0.1, 0.1, 0.18, 0.03, '#ff4d4d')
    return
  }

  if (spec.id === 'hauler') {
    // Pickup-style 4x4: load bed with roll bar, cab with the driver behind glass, long bonnet.
    tube(ctx, [[-1.9, 0.48], [-1.9, 0.78], [-0.95, 0.78], [-0.95, 0.48]], 0.07, '#b8bfca')
    shaded(ctx, [[-2.1, -0.3], [2.1, -0.3], [2.15, 0.3], [0.9, 0.42], [0.62, 1.1], [-0.62, 1.1], [-0.72, 0.45], [-2.1, 0.45]], c.light, c.body, c.dark)
    const glass: Pt[] = [[-0.52, 0.5], [0.66, 0.5], [0.5, 1.0], [-0.52, 1.0]]
    const sky = ctx.createLinearGradient(0, 0.5, 0, 1.0)
    sky.addColorStop(0, '#a9d4ee')
    sky.addColorStop(1, '#e6f4fc')
    poly(ctx, glass, sky)
    ctx.save()
    ctx.beginPath()
    glass.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.clip()
    driver([0.55, 0.42 - seat[1]])
    ctx.restore()
    poly(ctx, [[0.18, 0.55], [0.42, 0.55], [0.28, 0.95], [0.08, 0.95]], 'rgba(255,255,255,0.4)', false)
    poly(ctx, glass, 'rgba(0,0,0,0)')
    poly(ctx, [[-2.05, 0.4], [-0.78, 0.4], [-0.78, 0.22], [-2.05, 0.22]], c.dark, false)
    // Door line and handle
    tube(ctx, [[-0.62, 0.45], [-0.62, -0.2]], 0.025, c.dark)
    tube(ctx, [[0.75, 0.42], [0.75, -0.2]], 0.025, c.dark)
    rrect(ctx, 0.48, 0.18, 0.18, 0.06, 0.03, '#2a2f38', false)
    rrect(ctx, -2.22, -0.38, 0.32, 0.22, 0.05, '#3d4450')
    rrect(ctx, 1.92, -0.38, 0.34, 0.22, 0.05, '#3d4450')
    // Grille and lights
    for (let i = 0; i < 3; i++) rrect(ctx, 2.03, -0.1 + i * 0.08, 0.1, 0.04, 0.02, '#2a2f38', false)
    glow(ctx, 2.12, 0.15, 0.7, 'rgba(255, 240, 170, 0.55)')
    rrect(ctx, 1.98, 0.08, 0.17, 0.15, 0.05, '#fff6c8')
    rrect(ctx, -2.14, 0.06, 0.1, 0.18, 0.03, '#ff4d4d')
    poly(ctx, [[0.95, 0.38], [2.05, 0.28], [2.05, 0.33], [0.95, 0.44]], 'rgba(255,255,255,0.45)', false)
    return
  }

  // Runabout: open buggy with a roll bar behind the driver and a spare wheel at the back.
  tube(ctx, [[-0.95, 0.25], [-0.72, 1.12], [-0.42, 1.12]], 0.1, '#b8bfca')
  tube(ctx, [[-0.9, 0.3], [-0.55, 0.3]], 0.06, '#8b93a1')
  ctx.save()
  ctx.translate(-1.5, 0.45)
  ctx.scale(0.55, 0.55)
  drawWheel(ctx, 0.42)
  ctx.restore()
  driver([0.25, 0.56 - seat[1]])
  shaded(ctx, [[-1.45, -0.25], [1.45, -0.25], [1.5, 0.15], [0.55, 0.3], [0.15, 0.34], [-1.0, 0.34], [-1.5, 0.25]], c.light, c.body, c.dark)
  // Windscreen, steering wheel, racing stripe, vents
  poly(ctx, [[0.2, 0.32], [0.5, 0.3], [0.33, 0.66], [0.24, 0.66]], 'rgba(190, 230, 255, 0.65)')
  tube(ctx, [[0.18, 0.56], [0.3, 0.42]], 0.05, '#2a2f38')
  poly(ctx, [[-1.38, 0.0], [1.38, -0.05], [1.4, 0.05], [-1.4, 0.1]], 'rgba(255,255,255,0.85)', false)
  poly(ctx, [[-1.38, 0.13], [1.4, 0.08], [1.42, 0.12], [-1.4, 0.17]], 'rgba(255,255,255,0.85)', false)
  for (let i = 0; i < 3; i++) tube(ctx, [[0.75 + i * 0.12, 0.2], [0.82 + i * 0.12, 0.08]], 0.025, c.dark)
  glow(ctx, 1.48, 0.02, 0.6, 'rgba(255, 240, 170, 0.55)')
  rrect(ctx, 1.36, -0.05, 0.16, 0.14, 0.05, '#fff6c8')
  rrect(ctx, -1.57, 0.0, 0.1, 0.15, 0.03, '#ff4d4d')
  rrect(ctx, -1.62, -0.32, 0.28, 0.17, 0.05, '#3d4450')
  rrect(ctx, 1.36, -0.32, 0.28, 0.17, 0.05, '#3d4450')
  tube(ctx, [[-1.3, -0.2], [-1.62, -0.24]], 0.06, '#b8bfca')
}

/** Where each vehicle's exhaust comes out, in chassis coordinates (for smoke puffs). */
export const EXHAUST: Record<string, Pt> = {
  runabout: [-1.62, -0.24],
  scrambler: [-1.11, 0.39],
  hauler: [-2.0, -0.35],
  rover: [-0.9, 1.08],
  tractor: [0.95, 1.38],
  kart: [-1.15, 0.05],
  lander: [-1.3, 0.05],
  snowmobile: [-1.35, 0.1],
  monster: [-1.7, 0.1],
}

const COIN_COLOURS = [
  { min: 15, face: '#ffcf33', rim: '#c98a00' },
  { min: 10, face: '#dfe5ee', rim: '#8b93a1' },
  { min: 0, face: '#e09a5a', rim: '#9a5a22' },
]

/** A coin or a fuel can at its world position. `t` is time in seconds, for the spin. */
export function drawPickup(ctx: Ctx, p: Pickup, t: number): void {
  ctx.save()
  ctx.translate(p.x, p.y)
  if (p.kind === 'coin') {
    const c = COIN_COLOURS.find((k) => p.value >= k.min)!
    const squash = 0.35 + 0.65 * Math.abs(Math.cos(t * 3 + p.x))
    ctx.scale(squash, 1)
    ctx.beginPath()
    ctx.arc(0, 0, 0.32, 0, Math.PI * 2)
    ctx.fillStyle = c.face
    ctx.fill()
    ctx.lineWidth = LINE
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 0.21, 0, Math.PI * 2)
    ctx.lineWidth = 0.05
    ctx.strokeStyle = c.rim
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(-0.1, 0.12, 0.06, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fill()
    const glint = (t * 0.7 + p.x * 0.13) % 3
    if (glint < 0.35) {
      const k = Math.sin((glint / 0.35) * Math.PI) * 0.28
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(0.12, 0.12 + k)
      ctx.lineTo(0.15, 0.15)
      ctx.lineTo(0.12 + k, 0.12)
      ctx.lineTo(0.15, 0.09)
      ctx.lineTo(0.12, 0.12 - k)
      ctx.lineTo(0.09, 0.09)
      ctx.lineTo(0.12 - k, 0.12)
      ctx.lineTo(0.09, 0.15)
      ctx.closePath()
      ctx.fill()
    }
  } else if (p.kind === 'turbo') {
    // A blue turbo canister with a lightning flash, glowing.
    const bob = Math.sin(t * 3 + p.x) * 0.07
    ctx.translate(0, bob)
    glow(ctx, 0, 0, 0.9, 'rgba(90, 170, 255, 0.45)')
    rrect(ctx, -0.26, -0.5, 0.52, 0.95, 0.16, '#2f7fe0')
    rrect(ctx, -0.12, 0.45, 0.24, 0.12, 0.04, '#b8bfca')
    poly(ctx, [[0.06, 0.3], [-0.14, -0.02], [0.02, -0.02], [-0.06, -0.32], [0.16, 0.04], [0.0, 0.04]], '#ffd23f')
  } else {
    const bob = Math.sin(t * 2.5 + p.x) * 0.06
    ctx.translate(0, bob)
    poly(ctx, [[-0.36, -0.45], [0.36, -0.45], [0.36, 0.3], [0.15, 0.5], [-0.36, 0.5]], '#e5383b')
    rrect(ctx, -0.32, 0.5, 0.3, 0.12, 0.05, '#e5383b')
    poly(ctx, [[0.2, 0.38], [0.32, 0.5], [0.4, 0.42], [0.28, 0.3]], '#3d4450')
    tube(ctx, [[-0.22, -0.3], [0.22, 0.25]], 0.06, '#a8222f')
    tube(ctx, [[0.22, -0.3], [-0.22, 0.25]], 0.06, '#a8222f')
  }
  ctx.restore()
}
