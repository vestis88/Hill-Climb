import type { Pickup } from '../data/track'
import type { VehicleSpec } from '../sim/types'

/** Drawing helpers for vehicles, the driver and pickups. World units (metres), y up. See STYLE.md. */
export const OUTLINE = '#1d2433'
const LINE = 0.05

export const VEHICLE_COLOURS: Record<string, { body: string; dark: string; light: string }> = {
  runabout: { body: '#e2542f', dark: '#a8371b', light: '#f58a62' },
  scrambler: { body: '#2fae5f', dark: '#1d7a40', light: '#6fd391' },
  hauler: { body: '#f2b632', dark: '#b98318', light: '#ffd877' },
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
}

export function drawWheel(ctx: Ctx, radius: number, look: WheelLook = {}): void {
  if (look.mx) return drawMxWheel(ctx, radius, look)
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

export function drawHead(ctx: Ctx, r: number, mood: Mood = 'normal'): void {
  const helmet = ctx.createLinearGradient(0, -r, 0, r)
  helmet.addColorStop(0, '#0e7779')
  helmet.addColorStop(1, '#2cc6c8')
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = helmet
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Stripe over the top
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.82, Math.PI * 0.35, Math.PI * 0.75)
  ctx.lineWidth = r * 0.16
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  // Visor with the face behind it
  ctx.beginPath()
  ctx.moveTo(r * 0.02, r * 0.3)
  ctx.quadraticCurveTo(r * 1.1, r * 0.38, r * 0.98, -r * 0.3)
  ctx.lineTo(r * 0.1, -r * 0.26)
  ctx.closePath()
  ctx.fillStyle = '#ffe0c2'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  ctx.fillStyle = OUTLINE
  ctx.strokeStyle = OUTLINE
  ctx.lineCap = 'round'
  for (const ex of [0.42, 0.72]) {
    ctx.beginPath()
    if (mood === 'happy') {
      // Squinting happy eyes: little arcs.
      ctx.lineWidth = r * 0.07
      ctx.arc(r * ex, r * 0.02, r * 0.08, 0.2, Math.PI - 0.2)
      ctx.stroke()
    } else if (mood === 'worried') {
      // Wide eyes: white with a small pupil.
      ctx.ellipse(r * ex, r * 0.08, r * 0.1, r * 0.13, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.lineWidth = r * 0.03
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(r * (ex + 0.02), r * 0.08, r * 0.045, 0, Math.PI * 2)
      ctx.fillStyle = OUTLINE
      ctx.fill()
    } else {
      ctx.ellipse(r * ex, r * 0.06, r * 0.07, r * 0.11, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Mouth, just under the visor edge
  ctx.lineWidth = r * 0.06
  ctx.beginPath()
  if (mood === 'happy') ctx.arc(r * 0.6, -r * 0.12, r * 0.13, Math.PI + 0.3, Math.PI * 2 - 0.3, true)
  else if (mood === 'worried') ctx.ellipse(r * 0.62, -r * 0.18, r * 0.05, r * 0.06, 0, 0, Math.PI * 2)
  else {
    ctx.moveTo(r * 0.5, -r * 0.17)
    ctx.lineTo(r * 0.7, -r * 0.15)
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(190, 230, 255, 0.35)'
  ctx.beginPath()
  ctx.moveTo(r * 0.02, r * 0.3)
  ctx.quadraticCurveTo(r * 1.1, r * 0.38, r * 0.98, -r * 0.3)
  ctx.lineTo(r * 0.75, -r * 0.29)
  ctx.quadraticCurveTo(r * 0.7, r * 0.2, r * 0.02, r * 0.3)
  ctx.fill()
  // Shine
  ctx.beginPath()
  ctx.ellipse(-r * 0.35, r * 0.5, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fill()
}

/** Pip's body from the seat (origin) up the y axis, with the head on top. */
export function drawDriver(ctx: Ctx, headRadius: number, torso: number, hands?: Pt, mood: Mood = 'normal', foot?: Pt): void {
  const neck = torso - headRadius - 0.08
  // Legs first, behind the body: thigh forward to the knee, shin down to the foot.
  if (foot) {
    const knee: Pt = [foot[0] * 0.7 + 0.05, Math.max(foot[1] + 0.25, 0.12)]
    tube(ctx, [[0, 0.08], knee, foot], 0.13, '#2b3f6a')
    ctx.beginPath()
    ctx.ellipse(foot[0] + 0.05, foot[1] - 0.02, 0.1, 0.06, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#3d2a1e'
    ctx.fill()
    ctx.lineWidth = LINE * 0.8
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
  }
  const shoulder: Pt = [0.04, neck - 0.1]
  const hand: Pt = hands ?? [0.4, torso * 0.45]
  const elbow: Pt = [(shoulder[0] + hand[0]) / 2 - 0.02, (shoulder[1] + hand[1]) / 2 - 0.07]
  // Jacket body
  tube(ctx, [[0, 0.06], [0.02, neck - 0.02]], 0.28, '#24365c')
  tube(ctx, [[0.06, 0.1], [0.07, neck - 0.06]], 0.08, '#35508a')
  // Arm and glove
  tube(ctx, [shoulder, elbow, hand], 0.11, '#24365c')
  ctx.beginPath()
  ctx.arc(hand[0], hand[1], 0.075, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = LINE * 0.8
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Scarf, with a tail that streams behind
  tube(ctx, [[-0.12, neck + 0.02], [0.13, neck + 0.04]], 0.1, '#ff8a2a')
  tube(ctx, [[-0.08, neck], [-0.26, neck - 0.07], [-0.38, neck - 0.04]], 0.075, '#ff8a2a')
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
export function drawVehicle(ctx: Ctx, spec: VehicleSpec, lean: number, withDriver: boolean, mood: Mood = 'normal', hubs?: Pt[]): void {
  const c = VEHICLE_COLOURS[spec.id] ?? VEHICLE_COLOURS.runabout
  const { head, headRadius } = spec.driver
  const seat: Pt = [head.x, head.y - 0.75]
  // Where Pip's feet rest, relative to the seat: pedals in the cars, the footpeg on the bike.
  const feet: Record<string, Pt> = { runabout: [0.55, -0.2], scrambler: [0.1, -0.46], hauler: [0.55, -0.25] }
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
