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
export function drawWheel(ctx: Ctx, radius: number): void {
  const r = radius
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
  // Spokes
  ctx.strokeStyle = '#c9ced6'
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12)
    ctx.lineTo(Math.cos(a) * r * 0.44, Math.sin(a) * r * 0.44)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2)
  ctx.fillStyle = '#e8ecf2'
  ctx.fill()
  ctx.lineWidth = LINE * 0.8
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
}

/** Pip's helmeted head, centred on the origin, facing +x: shaded helmet, eyes behind the visor. */
export function drawHead(ctx: Ctx, r: number): void {
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
  for (const ex of [0.42, 0.72]) {
    ctx.beginPath()
    ctx.ellipse(r * ex, r * 0.06, r * 0.07, r * 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
  }
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
export function drawDriver(ctx: Ctx, headRadius: number, torso: number, hands?: Pt): void {
  const neck = torso - headRadius - 0.08
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
  drawHead(ctx, headRadius)
  ctx.restore()
}

/**
 * The vehicle body in chassis coordinates, with the seated driver drawn at `lean`
 * unless the driver has been thrown out (ragdoll).
 */
export function drawVehicle(ctx: Ctx, spec: VehicleSpec, lean: number, withDriver: boolean): void {
  const c = VEHICLE_COLOURS[spec.id] ?? VEHICLE_COLOURS.runabout
  const { head, headRadius } = spec.driver
  const seat: Pt = [head.x, head.y - 0.75]
  const driver = (hands?: Pt) => {
    if (!withDriver) return
    ctx.save()
    ctx.translate(seat[0], seat[1])
    ctx.rotate(lean)
    drawDriver(ctx, headRadius, 0.75, hands)
    ctx.restore()
  }

  if (spec.id === 'scrambler') {
    // Dirt bike: swingarm, frame, engine, chain, tank, seat, fork, number plate, fenders.
    tube(ctx, [[-0.72, -0.4], [-0.15, -0.05]], 0.1, '#5b6372')
    tube(ctx, [[-0.72, -0.4], [-0.12, -0.16]], 0.03, '#2a2f38')
    tube(ctx, [[0.78, -0.4], [0.48, 0.5]], 0.09, '#d7dce4')
    tube(ctx, [[0.73, -0.25], [0.55, 0.28]], 0.12, '#f2b632')
    rrect(ctx, -0.22, -0.24, 0.46, 0.34, 0.08, '#5b6372')
    for (let i = 0; i < 3; i++) tube(ctx, [[-0.15 + i * 0.14, -0.22], [-0.15 + i * 0.14, 0.08]], 0.02, '#3d4450')
    tube(ctx, [[-0.42, -0.18], [-0.82, 0.04], [-0.98, 0.06]], 0.08, '#b8bfca')
    shaded(ctx, [[-0.55, 0.22], [0.05, 0.12], [0.45, 0.35], [0.5, 0.52], [0.05, 0.44], [-0.6, 0.38]], c.light, c.body, c.dark)
    poly(ctx, [[-0.05, 0.37], [0.36, 0.45], [0.1, 0.48]], 'rgba(255,255,255,0.5)', false)
    rrect(ctx, -0.78, 0.33, 0.6, 0.12, 0.06, '#2a2f38')
    shaded(ctx, [[0.52, -0.02], [1.08, -0.02], [0.98, 0.12], [0.6, 0.12]], c.light, c.body, c.dark)
    shaded(ctx, [[-1.08, 0.05], [-0.55, 0.12], [-0.6, 0.22], [-1.12, 0.16]], c.light, c.body, c.dark)
    rrect(ctx, 0.42, 0.28, 0.2, 0.22, 0.04, '#ffffff')
    tube(ctx, [[0.42, 0.62], [0.62, 0.68]], 0.06, '#2a2f38')
    glow(ctx, 0.64, 0.38, 0.4, 'rgba(255, 240, 170, 0.5)')
    driver([0.52, 0.64 - seat[1]])
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
  scrambler: [-0.98, 0.06],
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
