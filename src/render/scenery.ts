import type { Environment } from '../data/environments'
import type { HeightFn } from '../sim/types'
import { OUTLINE } from './art'

/**
 * Sky, parallax backgrounds, ground and roadside props. Original art, drawn in code.
 * Everything is a pure function of position (via hash01), so nothing jitters between frames.
 */
type Ctx = CanvasRenderingContext2D

/** Deterministic 0..1 hash of an integer. */
export function hash01(i: number, salt = 0): number {
  let h = Math.imul(i ^ Math.imul(salt + 0x51ed27, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

/** Smooth noise 0..1. */
function smooth(x: number, salt: number): number {
  const i = Math.floor(x)
  const t = x - i
  const u = t * t * (3 - 2 * t)
  return hash01(i, salt) * (1 - u) + hash01(i + 1, salt) * u
}

/** Jagged noise 0..1 (straight lines between points): mountain peaks. */
function jagged(x: number, salt: number): number {
  const i = Math.floor(x)
  const t = x - i
  return hash01(i, salt) * (1 - t) + hash01(i + 1, salt) * t
}

interface Layer {
  /** Pixels the layer scrolls per metre the camera moves. */
  speed: number
  /** Baseline as a share of screen height, and the tallest feature as a share too. */
  base: number
  height: number
  shape: 'mountain' | 'hill'
  scale: number
  colour: string
  shade: string
  snow?: { colour: string; depth: number; line: number }
  trees?: { kind: 'round' | 'pine' | 'rock' | 'snowpine'; colour: string; light: string; density: number; size: number }
}

interface Theme {
  sky: [string, string, string]
  sun: { colour: string; glow: string; x: number; y: number; r: number } | null
  clouds: { light: string; shade: string } | null
  stars: boolean
  /** Animated life in the sky. */
  birds?: boolean
  shootingStars?: boolean
  aurora?: boolean
  /** Foreground silhouettes that pass in front along the bottom edge. */
  foreground: { colour: string; kind: 'grass' | 'rocks' | 'drifts' }
  layers: Layer[]
  haze: string
  ground: { top: string; deep: string; specks: string[]; stone: string; stoneDark: string }
  surface: { kind: 'grass' | 'dust' | 'snow'; main: string; dark: string; light: string }
  dust: string
}

const THEMES: Record<string, Theme> = {
  meadow: {
    // Sunny morning: blue overhead, a warm glow low on the horizon.
    sky: ['#3f93e0', '#9ccff0', '#fbe9cf'],
    sun: { colour: '#fff1b8', glow: 'rgba(255, 228, 160, 0.6)', x: 0.8, y: 0.2, r: 0.06 },
    clouds: { light: '#ffffff', shade: '#e8dfe6' },
    stars: false,
    birds: true,
    foreground: { colour: '#2f6b2c', kind: 'grass' },
    layers: [
      { speed: 3, base: 0.6, height: 0.36, shape: 'mountain', scale: 140, colour: '#9db9d4', shade: '#86a5c4', snow: { colour: '#f4f8fc', depth: 0.09, line: 0.62 } },
      { speed: 9, base: 0.68, height: 0.2, shape: 'hill', scale: 220, colour: '#86b996', shade: '#77aa88', trees: { kind: 'round', colour: '#689f7c', light: '#7cb18f', density: 0.55, size: 9 } },
      { speed: 20, base: 0.78, height: 0.16, shape: 'hill', scale: 180, colour: '#68a85f', shade: '#5a9852', trees: { kind: 'pine', colour: '#47844a', light: '#5a9a58', density: 0.5, size: 16 } },
    ],
    haze: 'rgba(214, 236, 248, 0.45)',
    ground: { top: '#7b5434', deep: '#45291a', specks: ['#8f6440', '#5f3c22', '#a5774f'], stone: '#8a6d52', stoneDark: '#5a3f29' },
    surface: { kind: 'grass', main: '#5cb03e', dark: '#3c8a2c', light: '#9ade63' },
    dust: '#c49a6c',
  },
  crater: {
    sky: ['#04060f', '#12183a', '#34315f'],
    sun: null,
    clouds: null,
    stars: true,
    shootingStars: true,
    foreground: { colour: '#26243a', kind: 'rocks' },
    layers: [
      { speed: 3, base: 0.62, height: 0.3, shape: 'mountain', scale: 110, colour: '#3b3762', shade: '#302d53' },
      { speed: 9, base: 0.7, height: 0.16, shape: 'hill', scale: 160, colour: '#4a4668', shade: '#3f3b5b', trees: { kind: 'rock', colour: '#3c3856', light: '#565274', density: 0.35, size: 10 } },
      { speed: 20, base: 0.8, height: 0.12, shape: 'hill', scale: 140, colour: '#5b5873', shade: '#4e4b65', trees: { kind: 'rock', colour: '#4a4762', light: '#6c6986', density: 0.45, size: 14 } },
    ],
    haze: 'rgba(60, 60, 110, 0.25)',
    ground: { top: '#6e6c79', deep: '#36343f', specks: ['#7d7b88', '#55535f', '#8e8c99'], stone: '#82808e', stoneDark: '#4f4d5a' },
    surface: { kind: 'dust', main: '#aeacb9', dark: '#7f7d8b', light: '#d4d2de' },
    dust: '#b7b8c2',
  },
  frost: {
    // Snowy dusk: deep blue to rose, a low pale sun, an aurora overhead.
    sky: ['#3b4f8f', '#9a8fc0', '#f3c9c0'],
    sun: { colour: '#fff3e8', glow: 'rgba(255, 210, 200, 0.55)', x: 0.78, y: 0.42, r: 0.05 },
    clouds: { light: '#f7ecf2', shade: '#c9b8d3' },
    stars: false,
    aurora: true,
    foreground: { colour: '#e6eef8', kind: 'drifts' },
    layers: [
      { speed: 3, base: 0.6, height: 0.42, shape: 'mountain', scale: 120, colour: '#a79fc6', shade: '#857ead', snow: { colour: '#fbeff2', depth: 0.16, line: 0.45 } },
      { speed: 9, base: 0.69, height: 0.2, shape: 'hill', scale: 200, colour: '#c4d6e8', shade: '#afc5dc', trees: { kind: 'snowpine', colour: '#6f8eaa', light: '#ffffff', density: 0.55, size: 11 } },
      { speed: 20, base: 0.79, height: 0.15, shape: 'hill', scale: 170, colour: '#dbe7f2', shade: '#c7d8e9', trees: { kind: 'snowpine', colour: '#56758f', light: '#ffffff', density: 0.5, size: 17 } },
    ],
    haze: 'rgba(246, 222, 222, 0.35)',
    ground: { top: '#6c7e93', deep: '#37424f', specks: ['#7b8ea3', '#56677a', '#8a9db1'], stone: '#8094a8', stoneDark: '#4f5f71' },
    surface: { kind: 'snow', main: '#f4f9fd', dark: '#bcd2e6', light: '#ffffff' },
    dust: '#ffffff',
  },
}

export const themeFor = (env: Environment) => THEMES[env.id] ?? THEMES.meadow

// ---------------------------------------------------------------------------------------
// Backdrop (screen space)

function layerHeight(layer: Layer, gx: number, salt: number): number {
  const s = layer.scale
  if (layer.shape === 'mountain') return 0.65 * jagged(gx / s, salt) + 0.25 * jagged(gx / (s * 0.37), salt + 1) + 0.1 * smooth(gx / (s * 0.12), salt + 2)
  return 0.6 * smooth(gx / s, salt) + 0.3 * smooth(gx / (s * 0.4), salt + 1) + 0.1 * smooth(gx / (s * 0.13), salt + 2)
}

function drawTreeShape(ctx: Ctx, kind: NonNullable<Layer['trees']>['kind'], x: number, y: number, size: number, colour: string, light: string): void {
  ctx.fillStyle = colour
  if (kind === 'round') {
    ctx.fillRect(x - size * 0.06, y - size * 0.5, size * 0.12, size * 0.5)
    ctx.beginPath()
    ctx.arc(x, y - size * 0.7, size * 0.38, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = light
    ctx.beginPath()
    ctx.arc(x - size * 0.12, y - size * 0.8, size * 0.16, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'pine' || kind === 'snowpine') {
    for (let k = 0; k < 3; k++) {
      const ty = y - size * (0.25 + k * 0.28)
      const tw = size * (0.42 - k * 0.1)
      ctx.fillStyle = colour
      ctx.beginPath()
      ctx.moveTo(x - tw, ty)
      ctx.lineTo(x, ty - size * 0.42)
      ctx.lineTo(x + tw, ty)
      ctx.fill()
      if (kind === 'snowpine') {
        ctx.fillStyle = light
        ctx.beginPath()
        ctx.moveTo(x - tw * 0.45, ty - size * 0.22)
        ctx.lineTo(x, ty - size * 0.42)
        ctx.lineTo(x + tw * 0.45, ty - size * 0.22)
        ctx.fill()
      }
    }
  } else {
    ctx.beginPath()
    ctx.moveTo(x - size * 0.5, y)
    ctx.lineTo(x - size * 0.35, y - size * 0.45)
    ctx.lineTo(x + size * 0.05, y - size * 0.6)
    ctx.lineTo(x + size * 0.45, y - size * 0.3)
    ctx.lineTo(x + size * 0.5, y)
    ctx.fill()
    ctx.fillStyle = light
    ctx.beginPath()
    ctx.moveTo(x - size * 0.35, y - size * 0.45)
    ctx.lineTo(x + size * 0.05, y - size * 0.6)
    ctx.lineTo(x - size * 0.05, y - size * 0.35)
    ctx.fill()
  }
}

/** Sky, sun or stars and planet, clouds, and three parallax layers with haze between them. */
export function drawBackdrop(ctx: Ctx, env: Environment, w: number, h: number, camX: number, camY: number, time: number): void {
  const t = themeFor(env)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, t.sky[0])
  sky.addColorStop(0.55, t.sky[1])
  sky.addColorStop(1, t.sky[2])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const unit = Math.min(w, h)

  if (t.stars) {
    for (let i = 0; i < 140; i++) {
      const sx = (((hash01(i, 1) * w * 1.6 - camX * 1.5) % w) + w) % w
      const sy = hash01(i, 3) * h * 0.65
      const twinkle = 0.55 + 0.45 * Math.sin(time * (1 + hash01(i, 4) * 2) + i)
      const r = hash01(i, 2) > 0.9 ? 1.6 : 0.9
      ctx.fillStyle = `rgba(255,255,255,${(0.3 + 0.6 * hash01(i, 5)) * twinkle})`
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // A blue-green planet with a soft atmosphere and a thin ring.
    const px = w * 0.76
    const py = h * 0.22
    const pr = unit * 0.11
    const glow = ctx.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.6)
    glow.addColorStop(0, 'rgba(120, 190, 255, 0.35)')
    glow.addColorStop(1, 'rgba(120, 190, 255, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(px - pr * 2, py - pr * 2, pr * 4, pr * 4)
    const body = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr)
    body.addColorStop(0, '#9fd7ff')
    body.addColorStop(1, '#2b5f9e')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(90, 170, 110, 0.85)'
    for (const [dx, dy, r] of [[-0.35, -0.2, 0.35], [0.25, 0.3, 0.3], [0.45, -0.35, 0.18]]) {
      ctx.beginPath()
      ctx.ellipse(px + dx * pr, py + dy * pr, r * pr, r * pr * 0.7, 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(0, 0, 30, 0.35)'
    ctx.beginPath()
    ctx.arc(px + pr * 0.45, py + pr * 0.45, pr * 1.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = 'rgba(220, 230, 255, 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(px, py, pr * 1.55, pr * 0.32, -0.3, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (t.sun) {
    const sx = w * t.sun.x
    const sy = h * t.sun.y
    const sr = unit * t.sun.r
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4)
    glow.addColorStop(0, t.sun.glow)
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8)
    ctx.fillStyle = t.sun.colour
    ctx.beginPath()
    ctx.arc(sx, sy, sr, 0, Math.PI * 2)
    ctx.fill()
  }

  if (t.clouds) {
    for (let i = 0; i < 7; i++) {
      const span = w + 400
      const x = ((((hash01(i, 4) * span - camX * 2 - time * (6 + 6 * hash01(i, 9))) % span) + span) % span) - 200
      const y = h * (0.07 + 0.28 * hash01(i, 5))
      const s = unit * (0.07 + 0.06 * hash01(i, 6))
      const puffs: [number, number, number][] = [[0, 0, 1], [1.1, 0.2, 0.75], [-1.1, 0.25, 0.7], [0.45, -0.45, 0.75], [-0.45, -0.3, 0.6]]
      // Shaded underside first, then the lit tops slightly higher.
      ctx.fillStyle = t.clouds.shade
      for (const [dx, dy, r] of puffs) {
        ctx.beginPath()
        ctx.arc(x + dx * s, y + dy * s * 0.6 + s * 0.12, r * s * 0.62, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = t.clouds.light
      for (const [dx, dy, r] of puffs) {
        ctx.beginPath()
        ctx.arc(x + dx * s, y + dy * s * 0.6 - s * 0.04, r * s * 0.56, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (t.aurora) drawAurora(ctx, w, h, time, camX)
  if (t.birds) drawBirds(ctx, w, h, time, camX)
  if (t.shootingStars) drawShootingStar(ctx, w, h, time)

  t.layers.forEach((layer, li) => {
    const offset = camX * layer.speed
    // Layers rise a little when the car climbs, nearer layers more.
    const lift = Math.max(-h * 0.08, Math.min(h * 0.12, camY * layer.speed * 0.25))
    const baseY = h * layer.base + lift
    const amp = h * layer.height
    const salt = env.seed * 7 + li * 31
    const step = 6
    const ys: number[] = []
    for (let x = -step; x <= w + step; x += step) ys.push(baseY - amp * layerHeight(layer, x + offset, salt))
    const path = () => {
      ctx.beginPath()
      ctx.moveTo(-step, h + 10)
      ys.forEach((y, i) => ctx.lineTo(-step + i * step, y))
      ctx.lineTo(w + step, h + 10)
      ctx.closePath()
    }
    // Shade first, then the lit colour shifted towards the light (upper left), clipped to the
    // outline: slopes facing right keep a band of shade.
    path()
    ctx.fillStyle = layer.shade
    ctx.fill()
    ctx.save()
    path()
    ctx.clip()
    ctx.save()
    ctx.translate(-amp * 0.09, -amp * 0.015)
    path()
    ctx.fillStyle = layer.colour
    ctx.fill()
    ctx.restore()
    if (layer.snow) {
      const snowY = baseY - amp * layer.snow.line
      ctx.beginPath()
      ys.forEach((y, i) => ctx.lineTo(-step + i * step, y))
      for (let i = ys.length - 1; i >= 0; i--) {
        const y = ys[i]
        const wobble = amp * 0.03 * Math.sin((i * step + offset) * 0.15)
        ctx.lineTo(-step + i * step, Math.max(y, Math.min(y + amp * layer.snow.depth, snowY + wobble)))
      }
      ctx.closePath()
      ctx.fillStyle = layer.snow.colour
      ctx.fill()
    }
    ctx.restore()
    if (layer.trees) {
      const tr = layer.trees
      const slot = tr.size * 1.6
      for (let k = Math.floor(offset / slot) - 1; k * slot - offset < w + slot; k++) {
        if (hash01(k, salt + 5) > tr.density) continue
        const x = k * slot - offset + hash01(k, salt + 6) * slot * 0.6
        const i = Math.round((x + step) / step)
        if (i < 0 || i >= ys.length) continue
        const size = tr.size * (0.75 + 0.5 * hash01(k, salt + 7))
        drawTreeShape(ctx, tr.kind, x, ys[i] + size * 0.1, size, tr.colour, tr.light)
      }
    }
    // Haze between layers for depth.
    if (li < t.layers.length - 1) {
      const haze = ctx.createLinearGradient(0, baseY - amp, 0, h)
      haze.addColorStop(0, 'rgba(255,255,255,0)')
      haze.addColorStop(1, t.haze)
      ctx.fillStyle = haze
      ctx.fillRect(0, baseY - amp, w, h - baseY + amp)
    }
  })
}

/** Rippling green and violet curtains of light. */
function drawAurora(ctx: Ctx, w: number, h: number, time: number, camX: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const [colour, base, amp, speed, salt] of [
    ['rgba(90, 255, 170, 0.16)', 0.16, 0.06, 0.25, 1],
    ['rgba(140, 120, 255, 0.12)', 0.24, 0.05, 0.18, 2],
  ] as const) {
    for (let band = 0; band < 3; band++) {
      ctx.beginPath()
      for (let x = 0; x <= w + 10; x += 10) {
        const gx = x + camX * 1.2
        const y = h * (base + band * 0.025) + h * amp * Math.sin(gx * 0.006 + time * speed + salt + band) + h * 0.02 * Math.sin(gx * 0.017 - time * 0.4)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      for (let x = w + 10; x >= 0; x -= 10) {
        const gx = x + camX * 1.2
        const y = h * (base + band * 0.025 + 0.09) + h * amp * Math.sin(gx * 0.006 + time * speed + salt + band + 0.4)
        ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = colour
      ctx.fill()
    }
  }
  ctx.restore()
}

/** A few birds flapping slowly across the sky. */
function drawBirds(ctx: Ctx, w: number, h: number, time: number, camX: number): void {
  ctx.strokeStyle = 'rgba(40, 50, 70, 0.7)'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const unit = Math.min(w, h)
  for (let i = 0; i < 5; i++) {
    const span = w + 200
    const x = ((((hash01(i, 51) * span + time * (18 + 10 * hash01(i, 52)) - camX * 4) % span) + span) % span) - 100
    const y = h * (0.12 + 0.2 * hash01(i, 53)) + Math.sin(time * 0.7 + i) * 6
    const s = unit * (0.012 + 0.008 * hash01(i, 54))
    const flap = Math.sin(time * (6 + i) + i * 2)
    ctx.lineWidth = Math.max(1.2, s * 0.25)
    ctx.beginPath()
    ctx.moveTo(x - s, y - s * 0.6 * flap)
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.2, x, y)
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.2, x + s, y - s * 0.6 * flap)
    ctx.stroke()
  }
}

/** Now and then a shooting star streaks across the sky. */
function drawShootingStar(ctx: Ctx, w: number, h: number, time: number): void {
  const period = 5
  const k = Math.floor(time / period)
  const t = (time % period) / 0.9
  if (t > 1) return
  const x0 = w * (0.15 + 0.6 * hash01(k, 61))
  const y0 = h * (0.05 + 0.2 * hash01(k, 62))
  const len = Math.min(w, h) * 0.35
  const x = x0 + len * t
  const y = y0 + len * 0.35 * t
  const g = ctx.createLinearGradient(x - len * 0.35, y - len * 0.12, x, y)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(1, `rgba(255,255,255,${0.9 * (1 - t)})`)
  ctx.strokeStyle = g
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - len * 0.35, y - len * 0.12)
  ctx.lineTo(x, y)
  ctx.stroke()
}

/**
 * Dark silhouettes passing along the bottom edge, in front of everything, moving faster than
 * the track for depth: grass clumps, rocks or snowdrifts.
 */
export function drawForeground(ctx: Ctx, env: Environment, w: number, h: number, camX: number, time: number): void {
  const f = themeFor(env).foreground
  const speed = 55
  const offset = camX * speed
  const slot = 140
  ctx.fillStyle = f.colour
  ctx.globalAlpha = f.kind === 'drifts' ? 0.85 : 0.9
  for (let k = Math.floor(offset / slot) - 1; k * slot - offset < w + slot; k++) {
    if (hash01(k, env.seed + 71) > 0.55) continue
    const x = k * slot - offset + hash01(k, env.seed + 72) * slot * 0.5
    const size = Math.min(w, h) * (0.06 + 0.06 * hash01(k, env.seed + 73))
    const y = h + size * 0.15
    ctx.beginPath()
    if (f.kind === 'grass') {
      const sway = Math.sin(time * 1.6 + k) * size * 0.12
      for (let b = -4; b <= 4; b++) {
        const bx = x + b * size * 0.12
        const bh = size * (0.7 + 0.5 * hash01(k * 9 + b, 74))
        ctx.moveTo(bx - size * 0.06, y)
        ctx.quadraticCurveTo(bx + sway * 0.5, y - bh * 0.6, bx + sway + b * size * 0.04, y - bh)
        ctx.lineTo(bx + size * 0.06, y)
      }
    } else if (f.kind === 'rocks') {
      ctx.moveTo(x - size, y)
      ctx.lineTo(x - size * 0.7, y - size * 0.6)
      ctx.lineTo(x - size * 0.1, y - size * 0.85)
      ctx.lineTo(x + size * 0.6, y - size * 0.5)
      ctx.lineTo(x + size, y)
    } else {
      ctx.ellipse(x, y, size * 1.4, size * 0.55, 0, Math.PI, Math.PI * 2)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------------------
// Ground (world space)

const textures = new Map<string, CanvasPattern | null>()

/** A tiling soil texture: specks, grit and small stones. Built once per environment. */
function groundPattern(ctx: Ctx, env: Environment): CanvasPattern | null {
  if (textures.has(env.id)) return textures.get(env.id)!
  const t = themeFor(env).ground
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  let pattern: CanvasPattern | null = null
  if (g) {
    g.fillStyle = t.top
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = t.specks[i % t.specks.length]
      g.globalAlpha = 0.25 + 0.35 * hash01(i, 21)
      const r = 0.6 + 2 * hash01(i, 22) ** 2
      g.beginPath()
      g.arc(hash01(i, 23) * size, hash01(i, 24) * size, r, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    // A few irregular stones, close to the soil colour so they read as texture, not dots.
    for (let i = 0; i < 7; i++) {
      const x = hash01(i, 25) * size
      const y = hash01(i, 26) * size
      const r = 3 + 6 * hash01(i, 27)
      const stone = (dx: number, dy: number, k: number) => {
        g.beginPath()
        for (let a = 0; a < 7; a++) {
          const ang = (a / 7) * Math.PI * 2
          const rr = r * k * (0.75 + 0.35 * hash01(i * 7 + a, 28))
          g.lineTo(x + dx + Math.cos(ang) * rr, y + dy + Math.sin(ang) * rr * 0.7)
        }
        g.closePath()
        g.fill()
      }
      g.globalAlpha = 0.7
      g.fillStyle = t.stoneDark
      stone(1, 1.5, 1)
      g.fillStyle = t.stone
      stone(0, 0, 0.92)
      g.globalAlpha = 1
    }
    pattern = ctx.createPattern(c, 'repeat')
    // 256 texture pixels span 7 metres of ground.
    pattern?.setTransform(new DOMMatrix().scale(7 / size))
  }
  textures.set(env.id, pattern)
  return pattern
}

/** Ground fill with texture and depth shading, a grass, dust or snow edge, and its details. */
export function drawGround(ctx: Ctx, env: Environment, height: HeightFn, left: number, right: number, bottom: number, top: number, time = 0): void {
  const t = themeFor(env)
  const step = 0.25
  const pts: [number, number][] = []
  for (let x = left; x <= right + step; x += step) pts.push([x, height(x)])
  const outline = () => {
    ctx.beginPath()
    ctx.moveTo(left, bottom)
    for (const [x, y] of pts) ctx.lineTo(x, y)
    ctx.lineTo(right + step, bottom)
    ctx.closePath()
  }

  outline()
  ctx.fillStyle = groundPattern(ctx, env) ?? t.ground.top
  ctx.fill()
  ctx.save()
  outline()
  ctx.clip()
  // Darken with depth below the surface: a band that follows the surface line.
  for (const [depth, alpha] of [[0.6, 0.12], [1.8, 0.16], [3.5, 0.2], [6, 0.25]] as const) {
    ctx.beginPath()
    ctx.moveTo(left, bottom)
    for (const [x, y] of pts) ctx.lineTo(x, y - depth - 0.25 * Math.sin(x * 0.37 + depth))
    ctx.lineTo(right + step, bottom)
    ctx.closePath()
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
    ctx.fill()
  }
  void top
  ctx.restore()

  // Surface: dark outline, main band, then a lighter lip.
  const line = (offset: number) => {
    ctx.beginPath()
    for (const [x, y] of pts) ctx.lineTo(x, y + offset)
  }
  const s = t.surface
  const band = s.kind === 'snow' ? 0.7 : s.kind === 'grass' ? 0.55 : 0.45
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  line(-band * 0.35)
  ctx.lineWidth = band + 0.12
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  line(-band * 0.35)
  ctx.lineWidth = band
  ctx.strokeStyle = s.dark
  ctx.stroke()
  line(-band * 0.2)
  ctx.lineWidth = band * 0.62
  ctx.strokeStyle = s.main
  ctx.stroke()
  line(0.02)
  ctx.lineWidth = 0.09
  ctx.strokeStyle = s.light
  ctx.stroke()

  if (s.kind === 'grass') {
    // Blades along the edge, a few taller tufts.
    ctx.fillStyle = s.main
    ctx.beginPath()
    for (let i = Math.floor(left / 0.14); i * 0.14 < right; i++) {
      const x = i * 0.14
      const y = height(x)
      const hgt = 0.12 + 0.16 * hash01(i, 31) + (hash01(i, 32) > 0.94 ? 0.2 : 0)
      // Each blade leans a little, and sways in a breeze that rolls along the track.
      const lean = (hash01(i, 33) - 0.5) * 0.12 + 0.05 * Math.sin(time * 2 + x * 0.6)
      ctx.moveTo(x - 0.05, y - 0.02)
      ctx.lineTo(x + lean, y + hgt)
      ctx.lineTo(x + 0.05, y - 0.02)
    }
    ctx.fill()
  } else if (s.kind === 'snow') {
    // Icicles under the snow lip now and then.
    ctx.fillStyle = '#dff0ff'
    for (let i = Math.floor(left / 0.9); i * 0.9 < right; i++) {
      if (hash01(i, 34) > 0.3) continue
      const x = i * 0.9 + hash01(i, 35) * 0.5
      const y = height(x) - band * 0.6
      const len = 0.15 + 0.3 * hash01(i, 36)
      ctx.beginPath()
      ctx.moveTo(x - 0.06, y)
      ctx.lineTo(x, y - len)
      ctx.lineTo(x + 0.06, y)
      ctx.fill()
    }
  } else {
    // Small craters pitted into the dust.
    for (let i = Math.floor(left / 2.5); i * 2.5 < right; i++) {
      if (hash01(i, 37) > 0.4) continue
      const x = i * 2.5 + hash01(i, 38)
      const y = height(x) - 0.12
      const r = 0.15 + 0.2 * hash01(i, 39)
      ctx.fillStyle = s.dark
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = s.light
      ctx.beginPath()
      ctx.ellipse(x, y - r * 0.12, r * 0.9, r * 0.2, 0, Math.PI, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ---------------------------------------------------------------------------------------
// Roadside props (world space, behind the vehicle)

function slopeAt(height: HeightFn, x: number): number {
  return (height(x + 0.5) - height(x - 0.5)) / 1
}

function outlineFill(ctx: Ctx, fill: string): void {
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 0.05
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
}

/** Trees, bushes, fences, flowers, rocks and crystals beside the track, chosen by hash. */
export function drawProps(ctx: Ctx, env: Environment, height: HeightFn, left: number, right: number): void {
  const slot = 6
  for (let i = Math.floor(left / slot) - 1; i * slot < right + 4; i++) {
    const r = hash01(i, env.seed + 101)
    if (r > 0.55 || i * slot < 18) continue
    const x = i * slot + hash01(i, env.seed + 102) * 3
    if (Math.abs(slopeAt(height, x)) > 0.6) continue
    const y = height(x) - 0.15
    const size = 0.8 + 0.6 * hash01(i, env.seed + 103)
    const kind = hash01(i, env.seed + 104)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(size, size)
    if (env.id === 'meadow') {
      if (kind < 0.35) roundTree(ctx)
      else if (kind < 0.55) pineTree(ctx, '#2f7a43', '#3f9455', false)
      else if (kind < 0.75) bush(ctx)
      else if (kind < 0.88) fence(ctx)
      else flowers(ctx, i)
    } else if (env.id === 'crater') {
      if (kind < 0.45) boulder(ctx, '#7c7a88', '#9a98a6')
      else if (kind < 0.75) crystals(ctx)
      else if (kind < 0.88) beacon(ctx)
      else boulder(ctx, '#6a6876', '#8a8896')
    } else {
      if (kind < 0.5) pineTree(ctx, '#3d5f78', '#4f7590', true)
      else if (kind < 0.7) boulder(ctx, '#8ea2b6', '#ffffff')
      else if (kind < 0.85) snowman(ctx)
      else iceSpikes(ctx)
    }
    ctx.restore()
  }
}

function roundTree(ctx: Ctx): void {
  ctx.beginPath()
  ctx.moveTo(-0.14, 0)
  ctx.lineTo(-0.09, 1.6)
  ctx.lineTo(0.09, 1.6)
  ctx.lineTo(0.14, 0)
  ctx.closePath()
  outlineFill(ctx, '#7a5232')
  for (const [cx, cy, r, c] of [[-0.45, 1.75, 0.6, '#3f8f3c'], [0.45, 1.8, 0.6, '#3f8f3c'], [0, 2.3, 0.75, '#4ea544'], [-0.15, 2.45, 0.38, '#66bf55']] as const) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    if (c === '#66bf55') {
      ctx.fillStyle = c
      ctx.fill()
    } else outlineFill(ctx, c)
  }
}

function pineTree(ctx: Ctx, colour: string, light: string, snow: boolean): void {
  ctx.fillStyle = '#6b4a2f'
  ctx.fillRect(-0.09, 0, 0.18, 0.5)
  for (let k = 0; k < 3; k++) {
    const by = 0.4 + k * 0.7
    const hw = 0.95 - k * 0.22
    ctx.beginPath()
    ctx.moveTo(-hw, by)
    ctx.lineTo(0, by + 1.15)
    ctx.lineTo(hw, by)
    ctx.closePath()
    outlineFill(ctx, colour)
    ctx.beginPath()
    ctx.moveTo(-hw * 0.15, by + 0.1)
    ctx.lineTo(0, by + 1.1)
    ctx.lineTo(-hw * 0.7, by + 0.1)
    ctx.closePath()
    ctx.fillStyle = light
    ctx.fill()
    if (snow) {
      ctx.beginPath()
      ctx.moveTo(-hw * 0.45, by + 0.62)
      ctx.lineTo(0, by + 1.15)
      ctx.lineTo(hw * 0.45, by + 0.62)
      ctx.quadraticCurveTo(0, by + 0.5, -hw * 0.45, by + 0.62)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  }
}

function bush(ctx: Ctx): void {
  for (const [cx, cy, r, c] of [[-0.35, 0.3, 0.38, '#3f8f3c'], [0.35, 0.3, 0.38, '#3f8f3c'], [0, 0.48, 0.45, '#4ea544']] as const) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    outlineFill(ctx, c)
  }
  ctx.fillStyle = '#e5383b'
  for (const [bx, by] of [[-0.2, 0.55], [0.15, 0.7], [0.4, 0.4]]) {
    ctx.beginPath()
    ctx.arc(bx, by, 0.06, 0, Math.PI * 2)
    ctx.fill()
  }
}

function fence(ctx: Ctx): void {
  for (const px of [-0.9, 0, 0.9]) {
    ctx.beginPath()
    ctx.rect(px - 0.07, 0, 0.14, 0.9)
    outlineFill(ctx, '#c69a6a')
  }
  for (const py of [0.35, 0.68]) {
    ctx.beginPath()
    ctx.rect(-1.05, py, 2.1, 0.12)
    outlineFill(ctx, '#d9b07f')
  }
}

function flowers(ctx: Ctx, seed: number): void {
  for (let k = 0; k < 5; k++) {
    const fx = (k - 2) * 0.28
    const fh = 0.3 + 0.25 * hash01(seed * 5 + k, 41)
    ctx.strokeStyle = '#3c8a2c'
    ctx.lineWidth = 0.05
    ctx.beginPath()
    ctx.moveTo(fx, 0)
    ctx.lineTo(fx, fh)
    ctx.stroke()
    ctx.fillStyle = ['#ff7eb6', '#ffd23f', '#ffffff', '#9b7bff'][Math.floor(hash01(seed * 5 + k, 42) * 4)]
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(fx + Math.cos(a) * 0.07, fh + Math.sin(a) * 0.07, 0.06, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#ffb020'
    ctx.beginPath()
    ctx.arc(fx, fh, 0.045, 0, Math.PI * 2)
    ctx.fill()
  }
}

function boulder(ctx: Ctx, colour: string, top: string): void {
  ctx.beginPath()
  ctx.moveTo(-0.8, 0)
  ctx.lineTo(-0.65, 0.5)
  ctx.lineTo(-0.2, 0.78)
  ctx.lineTo(0.4, 0.7)
  ctx.lineTo(0.75, 0.3)
  ctx.lineTo(0.8, 0)
  ctx.closePath()
  outlineFill(ctx, colour)
  ctx.beginPath()
  ctx.moveTo(-0.6, 0.48)
  ctx.lineTo(-0.2, 0.74)
  ctx.lineTo(0.35, 0.66)
  ctx.lineTo(0.1, 0.5)
  ctx.lineTo(-0.35, 0.4)
  ctx.closePath()
  ctx.fillStyle = top
  ctx.fill()
}

function crystals(ctx: Ctx): void {
  for (const [cx, hgt, lean] of [[-0.3, 0.9, -0.25], [0.05, 1.3, 0.05], [0.35, 0.8, 0.3]]) {
    ctx.save()
    ctx.translate(cx, 0)
    ctx.rotate(lean)
    ctx.beginPath()
    ctx.moveTo(-0.14, 0)
    ctx.lineTo(-0.14, hgt * 0.8)
    ctx.lineTo(0, hgt)
    ctx.lineTo(0.14, hgt * 0.8)
    ctx.lineTo(0.14, 0)
    ctx.closePath()
    outlineFill(ctx, '#4fd6c8')
    ctx.beginPath()
    ctx.moveTo(-0.14, 0)
    ctx.lineTo(-0.14, hgt * 0.8)
    ctx.lineTo(0, hgt)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fillStyle = '#9cf2e8'
    ctx.fill()
    ctx.restore()
  }
  const glow = ctx.createRadialGradient(0, 0.5, 0.1, 0, 0.5, 1.2)
  glow.addColorStop(0, 'rgba(120, 255, 230, 0.35)')
  glow.addColorStop(1, 'rgba(120, 255, 230, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(-1.2, -0.7, 2.4, 2.4)
}

function beacon(ctx: Ctx): void {
  ctx.beginPath()
  ctx.moveTo(-0.5, 0)
  ctx.lineTo(-0.1, 1.6)
  ctx.lineTo(0.1, 1.6)
  ctx.lineTo(0.5, 0)
  ctx.closePath()
  ctx.lineWidth = 0.08
  ctx.strokeStyle = '#8b93a1'
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-0.3, 0.8)
  ctx.lineTo(0.3, 0.8)
  ctx.stroke()
  const blink = Math.floor(performance.now() / 600) % 2 === 0
  ctx.beginPath()
  ctx.arc(0, 1.7, 0.13, 0, Math.PI * 2)
  outlineFill(ctx, blink ? '#ff5a5a' : '#7a2a2a')
  if (blink) {
    const glow = ctx.createRadialGradient(0, 1.7, 0.05, 0, 1.7, 0.7)
    glow.addColorStop(0, 'rgba(255, 90, 90, 0.5)')
    glow.addColorStop(1, 'rgba(255, 90, 90, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(-0.7, 1, 1.4, 1.4)
  }
}

function snowman(ctx: Ctx): void {
  for (const [cy, r] of [[0.35, 0.38], [0.92, 0.27], [1.33, 0.19]]) {
    ctx.beginPath()
    ctx.arc(0, cy, r, 0, Math.PI * 2)
    outlineFill(ctx, '#ffffff')
  }
  ctx.fillStyle = OUTLINE
  for (const ex of [-0.07, 0.07]) {
    ctx.beginPath()
    ctx.arc(ex, 1.38, 0.03, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ff8a2a'
  ctx.beginPath()
  ctx.moveTo(0, 1.33)
  ctx.lineTo(0.25, 1.3)
  ctx.lineTo(0, 1.28)
  ctx.fill()
  ctx.fillStyle = '#e5383b'
  ctx.fillRect(-0.24, 1.08, 0.48, 0.08)
}

function iceSpikes(ctx: Ctx): void {
  for (const [cx, hgt] of [[-0.3, 0.7], [0, 1.1], [0.3, 0.6]]) {
    ctx.beginPath()
    ctx.moveTo(cx - 0.16, 0)
    ctx.lineTo(cx, hgt)
    ctx.lineTo(cx + 0.16, 0)
    ctx.closePath()
    outlineFill(ctx, '#bfe6ff')
    ctx.beginPath()
    ctx.moveTo(cx - 0.16, 0)
    ctx.lineTo(cx, hgt)
    ctx.lineTo(cx, 0)
    ctx.closePath()
    ctx.fillStyle = '#e8f6ff'
    ctx.fill()
  }
}

/** Falling snow in Frost Pass, in screen space. */
export function drawWeather(ctx: Ctx, env: Environment, w: number, h: number, camX: number, time: number): void {
  if (env.id !== 'frost') return
  for (let i = 0; i < 80; i++) {
    const near = hash01(i, 15) > 0.7
    const x = (((hash01(i, 11) * w * 1.3 - camX * (near ? 30 : 15) + Math.sin(time + i) * 12) % w) + w) % w
    const y = (hash01(i, 12) * h + time * (near ? 60 : 25 + 20 * hash01(i, 13))) % h
    ctx.fillStyle = near ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(x, y, near ? 2.6 : 1.4 + hash01(i, 14), 0, Math.PI * 2)
    ctx.fill()
  }
}
