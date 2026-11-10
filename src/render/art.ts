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

function poly(ctx: Ctx, pts: Pt[], fill: string, outline = true): void {
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

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, outline = true): void {
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

/** A tyre with tread, rim and hub, in the wheel's own frame. */
export function drawWheel(ctx: Ctx, radius: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#2a2f38'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Tread blocks
  ctx.fillStyle = '#3d4450'
  for (let i = 0; i < 12; i++) {
    ctx.save()
    ctx.rotate((i / 12) * Math.PI * 2)
    ctx.fillRect(radius * 0.82, -radius * 0.09, radius * 0.16, radius * 0.18)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2)
  ctx.fillStyle = '#c9ced6'
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#8b93a1'
  for (let i = 0; i < 5; i++) {
    ctx.save()
    ctx.rotate((i / 5) * Math.PI * 2)
    ctx.beginPath()
    ctx.arc(radius * 0.32, 0, radius * 0.08, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.14, 0, Math.PI * 2)
  ctx.fillStyle = '#5b6372'
  ctx.fill()
}

/** Pip's helmeted head, centred on the origin, facing +x. */
export function drawHead(ctx: Ctx, r: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = '#18a5a7'
  ctx.fill()
  ctx.lineWidth = LINE
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  // Visor
  ctx.beginPath()
  ctx.moveTo(r * 0.05, r * 0.25)
  ctx.quadraticCurveTo(r * 1.05, r * 0.3, r * 0.95, -r * 0.25)
  ctx.lineTo(r * 0.15, -r * 0.2)
  ctx.closePath()
  ctx.fillStyle = '#f2f6fb'
  ctx.fill()
  ctx.stroke()
  // Highlight
  ctx.beginPath()
  ctx.arc(-r * 0.35, r * 0.45, r * 0.18, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fill()
}

/** Pip's body from the seat (origin) up the y axis, with the head on top. */
export function drawDriver(ctx: Ctx, headRadius: number, torso: number, hands?: Pt): void {
  // Torso
  tube(ctx, [[0, 0.05], [0.02, torso - headRadius - 0.1]], 0.26, '#24365c')
  // Arm to the handlebar or the wheel
  const shoulder: Pt = [0.04, torso - headRadius - 0.18]
  const hand: Pt = hands ?? [0.4, torso * 0.45]
  tube(ctx, [shoulder, [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2 - 0.05], hand], 0.1, '#24365c')
  // Scarf
  tube(ctx, [[-0.12, torso - headRadius - 0.08], [0.12, torso - headRadius - 0.06]], 0.09, '#ff8a2a')
  tube(ctx, [[-0.08, torso - headRadius - 0.1], [-0.3, torso - headRadius - 0.2]], 0.07, '#ff8a2a')
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
    // Dirt bike: swingarm, frame, engine, tank, seat, fork, fenders.
    tube(ctx, [[-0.72, -0.4], [-0.15, -0.05]], 0.09, '#5b6372')
    tube(ctx, [[0.78, -0.4], [0.5, 0.48]], 0.08, '#c9ced6')
    rrect(ctx, -0.2, -0.22, 0.42, 0.32, 0.08, '#5b6372')
    tube(ctx, [[-0.45, -0.18], [-0.85, 0.05]], 0.07, '#8b93a1')
    poly(ctx, [[-0.55, 0.22], [0.05, 0.12], [0.45, 0.35], [0.5, 0.5], [0.05, 0.42], [-0.6, 0.38]], c.body)
    poly(ctx, [[-0.1, 0.36], [0.4, 0.44], [0.12, 0.5]], c.light, false)
    rrect(ctx, -0.75, 0.33, 0.55, 0.11, 0.05, '#2a2f38')
    poly(ctx, [[0.55, -0.02], [1.05, -0.02], [0.95, 0.1], [0.6, 0.1]], c.dark)
    poly(ctx, [[-1.05, 0.05], [-0.55, 0.12], [-0.6, 0.2], [-1.1, 0.15]], c.dark)
    tube(ctx, [[0.42, 0.62], [0.6, 0.66]], 0.06, '#2a2f38')
    driver([0.5, 0.62 - seat[1]])
    return
  }

  if (spec.id === 'hauler') {
    // Pickup-style 4x4: load bed, cab with window and driver inside, long bonnet.
    poly(ctx, [[-2.1, -0.3], [2.1, -0.3], [2.15, 0.3], [0.9, 0.42], [0.62, 1.1], [-0.62, 1.1], [-0.72, 0.45], [-2.1, 0.45]], c.body)
    // Cab window: the driver is drawn inside it, clipped to the glass.
    const glass: Pt[] = [[-0.52, 0.5], [0.66, 0.5], [0.5, 1.0], [-0.52, 1.0]]
    poly(ctx, glass, '#cfe8f6')
    ctx.save()
    ctx.beginPath()
    glass.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.clip()
    driver([0.55, 0.42 - seat[1]])
    ctx.restore()
    poly(ctx, [[0.2, 0.55], [0.45, 0.55], [0.3, 0.95], [0.12, 0.95]], 'rgba(255,255,255,0.35)', false)
    poly(ctx, glass, 'rgba(0,0,0,0)')
    poly(ctx, [[-2.05, 0.4], [-0.78, 0.4], [-0.78, 0.25], [-2.05, 0.25]], c.dark, false)
    rrect(ctx, -2.2, -0.36, 0.28, 0.2, 0.05, '#3d4450')
    rrect(ctx, 1.95, -0.36, 0.3, 0.2, 0.05, '#3d4450')
    rrect(ctx, 1.98, 0.05, 0.16, 0.14, 0.04, '#fff3b0')
    rrect(ctx, -2.13, 0.08, 0.1, 0.16, 0.03, '#e5383b')
    poly(ctx, [[0.95, 0.4], [2.05, 0.3], [2.05, 0.34], [0.95, 0.46]], c.light, false)
    tube(ctx, [[-1.9, 0.48], [-1.9, 0.7], [-0.95, 0.7], [-0.95, 0.48]], 0.06, '#8b93a1')
    return
  }

  // Runabout: open buggy with a roll bar behind the driver.
  tube(ctx, [[-0.95, 0.25], [-0.72, 1.12], [-0.42, 1.12]], 0.09, '#8b93a1')
  driver([0.25, 0.55 - seat[1]])
  poly(ctx, [[-1.45, -0.25], [1.45, -0.25], [1.5, 0.15], [0.55, 0.3], [0.15, 0.32], [-1.0, 0.32], [-1.5, 0.25]], c.body)
  poly(ctx, [[0.2, 0.3], [0.5, 0.3], [0.32, 0.62], [0.24, 0.62]], 'rgba(170, 220, 255, 0.6)')
  tube(ctx, [[0.18, 0.55], [0.3, 0.42]], 0.05, '#2a2f38')
  poly(ctx, [[-1.35, 0.2], [1.3, 0.12], [1.3, 0.17], [-1.35, 0.26]], c.light, false)
  rrect(ctx, 1.35, -0.05, 0.16, 0.13, 0.04, '#fff3b0')
  rrect(ctx, -1.56, 0.0, 0.1, 0.15, 0.03, '#e5383b')
  rrect(ctx, -1.6, -0.3, 0.25, 0.16, 0.05, '#3d4450')
  rrect(ctx, 1.38, -0.3, 0.25, 0.16, 0.05, '#3d4450')
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
