import type { Atmosphere } from '../data/weather'
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
  trees?: { kind: 'round' | 'pine' | 'rock' | 'snowpine' | 'cactus'; colour: string; light: string; density: number; size: number }
}

interface Theme {
  sky: [string, string, string]
  sun: { colour: string; glow: string; x: number; y: number; r: number } | null
  clouds: { light: string; shade: string } | null
  stars: boolean
  /** A ringed planet hangs in the sky (Crater Fields). */
  planet?: boolean
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
    planet: true,
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

THEMES.dunes = {
  // Golden afternoon over the desert: clear sky, a big hot sun, mesas on the horizon.
  sky: ['#3d8fd6', '#9fcde9', '#f9dca6'],
  sun: { colour: '#fffbe6', glow: 'rgba(255, 236, 170, 0.7)', x: 0.7, y: 0.18, r: 0.075 },
  clouds: null,
  stars: false,
  birds: true,
  foreground: { colour: '#b07a4a', kind: 'rocks' },
  layers: [
    { speed: 3, base: 0.62, height: 0.26, shape: 'mountain', scale: 170, colour: '#d99a6c', shade: '#c4855a' },
    { speed: 9, base: 0.7, height: 0.16, shape: 'hill', scale: 260, colour: '#e8bf84', shade: '#d9ac6f', trees: { kind: 'cactus', colour: '#5f8f4a', light: '#7aa85f', density: 0.22, size: 11 } },
    { speed: 20, base: 0.8, height: 0.14, shape: 'hill', scale: 220, colour: '#f0cd8f', shade: '#e3bb78', trees: { kind: 'cactus', colour: '#4f7f3c', light: '#6c9a52', density: 0.28, size: 17 } },
  ],
  haze: 'rgba(255, 230, 190, 0.4)',
  ground: { top: '#d9a864', deep: '#9c6a3a', specks: ['#e6b977', '#b98348', '#f2cb8c'], stone: '#c08f5a', stoneDark: '#8c5f34' },
  surface: { kind: 'dust', main: '#f1d29a', dark: '#d6b075', light: '#fbe6bd' },
  dust: '#e8c88f',
}

THEMES.canyon = {
  // Late afternoon in a red canyon: tall cliffs, warm light low in the west.
  sky: ['#4f86c9', '#e9b48a', '#f6d2a8'],
  sun: { colour: '#fff1d6', glow: 'rgba(255, 196, 140, 0.6)', x: 0.22, y: 0.32, r: 0.06 },
  clouds: { light: '#fff3e6', shade: '#f0cdb6' },
  stars: false,
  birds: true,
  foreground: { colour: '#6e2f1c', kind: 'rocks' },
  layers: [
    { speed: 3, base: 0.6, height: 0.46, shape: 'mountain', scale: 95, colour: '#b5583a', shade: '#9a4630' },
    { speed: 9, base: 0.7, height: 0.2, shape: 'mountain', scale: 140, colour: '#c9714a', shade: '#b4603c', trees: { kind: 'rock', colour: '#a85636', light: '#d98a5f', density: 0.35, size: 10 } },
    { speed: 20, base: 0.8, height: 0.14, shape: 'hill', scale: 150, colour: '#d98757', shade: '#c77548', trees: { kind: 'rock', colour: '#a14f2f', light: '#e09466', density: 0.45, size: 15 } },
  ],
  haze: 'rgba(255, 210, 170, 0.35)',
  ground: { top: '#b9653f', deep: '#6e3320', specks: ['#c97549', '#8d4426', '#da8a5c'], stone: '#c27a52', stoneDark: '#7c3c22' },
  surface: { kind: 'dust', main: '#d9875a', dark: '#b8673f', light: '#eaa77c' },
  dust: '#d98d62',
}

THEMES.woods = {
  // A moonlit night in the forest: stars, a big moon, fireflies drifting over the track.
  sky: ['#0b1530', '#1f3560', '#3e5a7a'],
  sun: { colour: '#f4f1dc', glow: 'rgba(210, 225, 255, 0.35)', x: 0.75, y: 0.2, r: 0.05 },
  clouds: { light: '#3c5276', shade: '#2c3e5e' },
  stars: true,
  foreground: { colour: '#0c1c14', kind: 'grass' },
  layers: [
    { speed: 3, base: 0.62, height: 0.28, shape: 'hill', scale: 160, colour: '#1d2d4c', shade: '#17253f', trees: { kind: 'pine', colour: '#15233c', light: '#1d2f4d', density: 0.7, size: 12 } },
    { speed: 9, base: 0.7, height: 0.2, shape: 'hill', scale: 200, colour: '#20374f', shade: '#1a2e44', trees: { kind: 'pine', colour: '#152a3c', light: '#1f3a52', density: 0.75, size: 17 } },
    { speed: 20, base: 0.8, height: 0.15, shape: 'hill', scale: 170, colour: '#22403a', shade: '#1b3530', trees: { kind: 'pine', colour: '#132a22', light: '#22463a', density: 0.7, size: 24 } },
  ],
  haze: 'rgba(80, 110, 150, 0.25)',
  ground: { top: '#4a3424', deep: '#22160f', specks: ['#5a4030', '#2e1f14', '#6b4c36'], stone: '#5c4a3c', stoneDark: '#33261c' },
  surface: { kind: 'grass', main: '#2f6a3a', dark: '#21502b', light: '#4d8f52' },
  dust: '#6b5340',
}

THEMES.stunt = {
  // A stunt arena at sunset: violet sky, an orange glow, rocky bluffs and packed dirt.
  sky: ['#2b2d6e', '#8a4f8f', '#f08a5d'],
  sun: { colour: '#ffe2b8', glow: 'rgba(255, 170, 120, 0.6)', x: 0.3, y: 0.46, r: 0.07 },
  clouds: { light: '#f6b9a0', shade: '#b97a95' },
  stars: false,
  birds: false,
  foreground: { colour: '#3a2a3e', kind: 'rocks' },
  layers: [
    { speed: 3, base: 0.6, height: 0.36, shape: 'mountain', scale: 120, colour: '#5a4a7a', shade: '#4a3c68' },
    { speed: 9, base: 0.7, height: 0.18, shape: 'mountain', scale: 160, colour: '#6e5584', shade: '#5f4874', trees: { kind: 'rock', colour: '#57436a', light: '#866c9c', density: 0.3, size: 10 } },
    { speed: 20, base: 0.8, height: 0.13, shape: 'hill', scale: 150, colour: '#7a5a8a', shade: '#6a4d79', trees: { kind: 'rock', colour: '#5d4468', light: '#93729f', density: 0.4, size: 14 } },
  ],
  haze: 'rgba(240, 150, 120, 0.25)',
  ground: { top: '#7a5a48', deep: '#3a2a26', specks: ['#8a6a54', '#5a4034', '#9a7a62'], stone: '#8a7060', stoneDark: '#4a3830' },
  surface: { kind: 'dust', main: '#c9a27a', dark: '#a8835e', light: '#e2c39c' },
  dust: '#c9a27a',
}

export const themeFor = (env: Environment) => THEMES[env.theme ?? env.id] ?? THEMES.meadow

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
  } else if (kind === 'cactus') {
    const wdt = size * 0.13
    ctx.beginPath()
    ctx.roundRect(x - wdt / 2, y - size * 0.95, wdt, size * 0.95, wdt / 2)
    ctx.roundRect(x - size * 0.32, y - size * 0.62, wdt * 0.8, size * 0.3, wdt / 2)
    ctx.roundRect(x - size * 0.32, y - size * 0.4, size * 0.3, wdt * 0.8, wdt / 2)
    ctx.roundRect(x + size * 0.2, y - size * 0.75, wdt * 0.8, size * 0.32, wdt / 2)
    ctx.roundRect(x + wdt * 0.3, y - size * 0.5, size * 0.22, wdt * 0.8, wdt / 2)
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
/** Cached skies by environment and size (the game, plus the garage's small previews). */
const skyCache = new Map<string, HTMLCanvasElement>()

/** The parts of the sky that stay put on screen: gradient, planet (Crater Fields) and sun. */
function drawStaticSky(ctx: Ctx, t: ReturnType<typeof themeFor>, w: number, h: number, unit: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, t.sky[0])
  sky.addColorStop(0.55, t.sky[1])
  sky.addColorStop(1, t.sky[2])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  if (t.planet) {
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
}

export function drawBackdrop(ctx: Ctx, env: Environment, w: number, h: number, camX: number, camY: number, time: number): void {
  const t = themeFor(env)
  const unit = Math.min(w, h)
  // The sky gradient, sun and planet never move on screen: draw them once into an offscreen
  // canvas per environment and screen size, then copy it each frame (much cheaper than
  // filling full-screen gradients every frame, which dominated drawing on large screens).
  const scale = ctx.getTransform().a || 1
  const key = `${env.id}:${w}x${h}@${scale}`
  let sky = skyCache.get(key)
  if (!sky) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const c = canvas.getContext('2d')!
    c.scale(scale, scale)
    drawStaticSky(c, t, w, h, unit)
    if (skyCache.size > 6) skyCache.delete(skyCache.keys().next().value!)
    skyCache.set(key, canvas)
    sky = canvas
  }
  ctx.drawImage(sky, 0, 0, w, h)

  if (t.stars) {
    for (let i = 0; i < 140; i++) {
      const sx = (((hash01(i, 1) * w * 1.6 - camX * 1.5) % w) + w) % w
      const sy = hash01(i, 3) * h * 0.65
      // Not in front of the planet (in the cached sky).
      if (t.planet && Math.hypot(sx - w * 0.76, sy - h * 0.22) < unit * 0.12) continue
      // Nor in front of the moon.
      if (t.sun && Math.hypot(sx - w * t.sun.x, sy - h * t.sun.y) < unit * t.sun.r * 1.4) continue
      const twinkle = 0.55 + 0.45 * Math.sin(time * (1 + hash01(i, 4) * 2) + i)
      const r = hash01(i, 2) > 0.9 ? 1.6 : 0.9
      ctx.fillStyle = `rgba(255,255,255,${(0.3 + 0.6 * hash01(i, 5)) * twinkle})`
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
    }
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
  const key = env.theme ?? env.id
  if (textures.has(key)) return textures.get(key)!
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
  textures.set(key, pattern)
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
    } else if (env.id === 'dunes') {
      if (kind < 0.4) cactus(ctx)
      else if (kind < 0.6) boulder(ctx, '#c08f5a', '#e0b27a')
      else if (kind < 0.8) tumbleweed(ctx)
      else bones(ctx)
    } else if (env.id === 'canyon') {
      if (kind < 0.5) boulder(ctx, '#a85636', '#d98a5f')
      else if (kind < 0.7) boulder(ctx, '#8d4426', '#c27a52')
      else if (kind < 0.88) cactus(ctx)
      else signpost(ctx)
    } else if (env.id === 'woods') {
      if (kind < 0.45) pineTree(ctx, '#1d3a2c', '#2a5040', false)
      else if (kind < 0.7) mushrooms(ctx, i)
      else if (kind < 0.88) log(ctx)
      else boulder(ctx, '#4a4440', '#6a625a')
    } else if (env.id === 'stunt') {
      if (kind < 0.3) tyreStack(ctx)
      else if (kind < 0.5) hayBale(ctx)
      else if (kind < 0.7) cone(ctx)
      else if (kind < 0.85) pennant(ctx, i)
      else boulder(ctx, '#6a5060', '#8a7080')
    } else {
      if (kind < 0.5) pineTree(ctx, '#3d5f78', '#4f7590', true)
      else if (kind < 0.7) boulder(ctx, '#8ea2b6', '#ffffff')
      else if (kind < 0.85) snowman(ctx)
      else iceSpikes(ctx)
    }
    ctx.restore()
  }
}

/** Stuntbanan's props: stacked tyres, straw bales, traffic cones and pennant flags. */
function tyreStack(ctx: Ctx): void {
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.roundRect(-0.5, i * 0.32, 1, 0.3, 0.12)
    outlineFill(ctx, '#2a2a30')
    ctx.fillStyle = i === 1 ? '#e5383b' : '#f4f4f4'
    ctx.fillRect(-0.5, i * 0.32 + 0.12, 1, 0.06)
  }
}

function hayBale(ctx: Ctx): void {
  ctx.beginPath()
  ctx.roundRect(-0.6, 0, 1.2, 0.6, 0.1)
  outlineFill(ctx, '#e0b84f')
  ctx.strokeStyle = 'rgba(120, 80, 20, 0.6)'
  ctx.lineWidth = 0.04
  ctx.beginPath()
  for (const x of [-0.3, 0.3]) {
    ctx.moveTo(x, 0.04)
    ctx.lineTo(x, 0.56)
  }
  ctx.stroke()
}

function cone(ctx: Ctx): void {
  ctx.beginPath()
  ctx.moveTo(-0.3, 0)
  ctx.lineTo(0.3, 0)
  ctx.lineTo(0.06, 0.8)
  ctx.lineTo(-0.06, 0.8)
  ctx.closePath()
  outlineFill(ctx, '#ff7a1a')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(-0.17, 0.3, 0.34, 0.12)
}

function pennant(ctx: Ctx, seed: number): void {
  ctx.fillStyle = '#d7dce4'
  ctx.fillRect(-0.04, 0, 0.08, 2.6)
  ctx.beginPath()
  ctx.moveTo(0.04, 2.6)
  ctx.lineTo(0.95, 2.35)
  ctx.lineTo(0.04, 2.1)
  ctx.closePath()
  outlineFill(ctx, ['#e5383b', '#ffd23f', '#3a86ff', '#2ec4b6'][seed & 3])
}

function cactus(ctx: Ctx): void {
  const arm = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, Math.min(w, h) / 2)
    outlineFill(ctx, '#5f9a4a')
  }
  arm(-0.45, 0.9, 0.18, 0.75)
  arm(-0.45, 0.85, 0.42, 0.18)
  arm(0.27, 1.2, 0.18, 0.65)
  arm(0.05, 1.15, 0.4, 0.18)
  arm(-0.14, 0, 0.28, 2.1)
  ctx.strokeStyle = 'rgba(30, 60, 20, 0.5)'
  ctx.lineWidth = 0.03
  ctx.beginPath()
  ctx.moveTo(0, 0.1)
  ctx.lineTo(0, 2)
  ctx.stroke()
}

function tumbleweed(ctx: Ctx): void {
  ctx.strokeStyle = '#9c7444'
  ctx.lineWidth = 0.05
  for (let k = 0; k < 7; k++) {
    ctx.beginPath()
    ctx.ellipse(0, 0.45, 0.45, 0.4, (k * Math.PI) / 7, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function bones(ctx: Ctx): void {
  ctx.fillStyle = '#f3ead6'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 0.04
  ctx.beginPath()
  ctx.ellipse(0, 0.22, 0.32, 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = OUTLINE
  for (const dx of [-0.12, 0.12]) {
    ctx.beginPath()
    ctx.arc(dx, 0.26, 0.06, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f3ead6'
  ctx.beginPath()
  ctx.roundRect(0.35, 0.05, 0.6, 0.1, 0.05)
  ctx.fill()
  ctx.stroke()
}

function signpost(ctx: Ctx): void {
  ctx.beginPath()
  ctx.rect(-0.06, 0, 0.12, 1.4)
  outlineFill(ctx, '#7a5232')
  ctx.beginPath()
  ctx.moveTo(-0.5, 1.1)
  ctx.lineTo(0.5, 1.1)
  ctx.lineTo(0.7, 1.25)
  ctx.lineTo(0.5, 1.4)
  ctx.lineTo(-0.5, 1.4)
  ctx.closePath()
  outlineFill(ctx, '#c79a62')
}

/** Little glowing mushrooms (the woods at night). */
function mushrooms(ctx: Ctx, seed: number): void {
  for (let k = 0; k < 3; k++) {
    const x = (k - 1) * 0.35 + (hash01(seed, k) - 0.5) * 0.1
    const h = 0.25 + 0.25 * hash01(seed, k + 5)
    ctx.beginPath()
    ctx.rect(x - 0.04, 0, 0.08, h)
    outlineFill(ctx, '#e8e0cc')
    const glow = ctx.createRadialGradient(x, h, 0, x, h, 0.5)
    glow.addColorStop(0, 'rgba(120, 230, 255, 0.45)')
    glow.addColorStop(1, 'rgba(120, 230, 255, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - 0.5, h - 0.5, 1, 1)
    ctx.beginPath()
    ctx.ellipse(x, h, 0.16, 0.1, 0, Math.PI, 0, true)
    outlineFill(ctx, '#5fd0e8')
  }
}

function log(ctx: Ctx): void {
  ctx.beginPath()
  ctx.roundRect(-0.9, 0, 1.8, 0.38, 0.19)
  outlineFill(ctx, '#5a3c26')
  ctx.beginPath()
  ctx.ellipse(0.9, 0.19, 0.1, 0.19, 0, 0, Math.PI * 2)
  outlineFill(ctx, '#a07a52')
  ctx.beginPath()
  ctx.ellipse(-0.3, 0.38, 0.12, 0.05, 0, Math.PI, 0)
  outlineFill(ctx, '#3f8f3c')
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
  if (env.id === 'woods') return drawFireflies(ctx, w, h, camX, time)
  if (env.id === 'dunes') return drawBlowingSand(ctx, w, h, camX, time)
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

/** Fireflies drifting over the woods, pulsing softly. */
function drawFireflies(ctx: Ctx, w: number, h: number, camX: number, time: number): void {
  for (let i = 0; i < 26; i++) {
    const x = (((hash01(i, 31) * w * 1.4 - camX * 22 + Math.sin(time * 0.7 + i) * 30) % w) + w) % w
    const y = h * (0.35 + 0.5 * hash01(i, 32)) + Math.sin(time * 1.1 + i * 2) * 18
    const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(time * (1.5 + hash01(i, 33)) + i * 1.7))
    const g = ctx.createRadialGradient(x, y, 0, x, y, 10)
    g.addColorStop(0, `rgba(230, 255, 140, ${0.9 * pulse})`)
    g.addColorStop(1, 'rgba(230, 255, 140, 0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 10, y - 10, 20, 20)
  }
}

/** Fine sand blowing low across the dunes. */
function drawBlowingSand(ctx: Ctx, w: number, h: number, camX: number, time: number): void {
  ctx.strokeStyle = 'rgba(255, 236, 200, 0.35)'
  ctx.lineWidth = 1.5
  for (let i = 0; i < 24; i++) {
    const x = (((hash01(i, 41) * w * 1.3 - camX * 40 - time * (120 + 80 * hash01(i, 42))) % (w + 80)) + w + 80) % (w + 80) - 40
    const y = h * (0.6 + 0.35 * hash01(i, 43)) + Math.sin(time * 2 + i) * 4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 18 + 22 * hash01(i, 44), y - 2)
    ctx.stroke()
  }
}

/**
 * Draw the mood over the scene (screen space): a dusk or night tint with a pool of headlight
 * light around the vehicle, and rain, snow or drifting fog.
 */
export function drawAtmosphere(ctx: Ctx, a: Atmosphere, w: number, h: number, camX: number, time: number, light: { x: number; y: number; r: number } | null): void {
  if (a.time !== 'day') {
    ctx.save()
    const g = ctx.createLinearGradient(0, 0, 0, h)
    if (a.time === 'dusk') {
      g.addColorStop(0, 'rgba(255, 110, 70, 0.28)')
      g.addColorStop(0.55, 'rgba(200, 80, 120, 0.16)')
      g.addColorStop(1, 'rgba(60, 30, 80, 0.22)')
    } else {
      g.addColorStop(0, 'rgba(8, 14, 48, 0.62)')
      g.addColorStop(1, 'rgba(6, 10, 30, 0.5)')
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    if (a.time === 'night') {
      // A few stars in the sky, and the headlights lighting up the track around the vehicle.
      for (let i = 0; i < 40; i++) {
        const x = (((hash01(i, 71) * w * 1.5 - camX * 2) % w) + w) % w
        const y = hash01(i, 72) * h * 0.4
        ctx.fillStyle = `rgba(255, 255, 240, ${0.4 + 0.5 * Math.abs(Math.sin(time * 1.3 + i))})`
        ctx.fillRect(x, y, 2, 2)
      }
      if (light) {
        ctx.globalCompositeOperation = 'lighter'
        const l = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.r)
        l.addColorStop(0, 'rgba(255, 235, 170, 0.32)')
        l.addColorStop(1, 'rgba(255, 235, 170, 0)')
        ctx.fillStyle = l
        ctx.fillRect(light.x - light.r, light.y - light.r, light.r * 2, light.r * 2)
      }
    }
    ctx.restore()
  }
  if (a.weather === 'rain') {
    ctx.save()
    ctx.strokeStyle = 'rgba(190, 215, 255, 0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < 140; i++) {
      const near = hash01(i, 81) > 0.6
      const x = (((hash01(i, 82) * w * 1.3 - camX * (near ? 40 : 20) - time * 80) % w) + w) % w
      const y = (hash01(i, 83) * h + time * (near ? 900 : 600)) % h
      ctx.moveTo(x, y)
      ctx.lineTo(x - 4, y + (near ? 22 : 14))
    }
    ctx.stroke()
    ctx.fillStyle = 'rgba(90, 110, 140, 0.12)'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  } else if (a.weather === 'snow') {
    for (let i = 0; i < 90; i++) {
      const near = hash01(i, 91) > 0.7
      const x = (((hash01(i, 92) * w * 1.3 - camX * (near ? 30 : 15) + Math.sin(time + i) * 14) % w) + w) % w
      const y = (hash01(i, 93) * h + time * (near ? 70 : 30 + 20 * hash01(i, 94))) % h
      ctx.fillStyle = near ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.arc(x, y, near ? 2.8 : 1.5 + hash01(i, 95), 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (a.weather === 'fog') {
    // Bands of mist across the whole screen, thickest low down, slowly rising and falling.
    for (let i = 0; i < 4; i++) {
      const y = h * (0.35 + i * 0.17) + Math.sin(time * 0.4 + i * 1.7 - camX * 0.02) * 18
      const g = ctx.createLinearGradient(0, y - 70, 0, y + 70)
      g.addColorStop(0, 'rgba(230, 236, 242, 0)')
      g.addColorStop(0.5, `rgba(230, 236, 242, ${0.16 + i * 0.05})`)
      g.addColorStop(1, 'rgba(230, 236, 242, 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, y - 70, w, 140)
    }
  }
}

/**
 * A Klurbana's solids (closed polygons): filled with the map's ground, darker inside, with the
 * map's surface (grass, dust, snow) along every edge that faces up, and a dark outline.
 */
export function drawSolids(ctx: Ctx, env: Environment, polygons: [number, number][][], left: number, right: number): void {
  const t = themeFor(env)
  const s = t.surface
  const band = s.kind === 'snow' ? 0.6 : s.kind === 'grass' ? 0.5 : 0.42
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const poly of polygons) {
    let minX = Infinity
    let maxX = -Infinity
    for (const [x] of poly) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
    if (maxX < left - 2 || minX > right + 2) continue
    const path = () => {
      ctx.beginPath()
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
    }
    path()
    ctx.fillStyle = groundPattern(ctx, env) ?? t.ground.top
    ctx.fill()
    // Darker towards the inside: the outline again, thick and translucent, clipped inside.
    ctx.save()
    path()
    ctx.clip()
    for (const [w, a] of [[2.4, 0.1], [5, 0.12], [9, 0.14]] as const) {
      path()
      ctx.lineWidth = w
      ctx.strokeStyle = `rgba(0,0,0,${a})`
      ctx.stroke()
    }
    ctx.restore()
    path()
    ctx.lineWidth = 0.08
    ctx.strokeStyle = OUTLINE
    ctx.stroke()
    // Surface along the edges that face up (outward normal pointing up).
    let area = 0
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      area += x1 * y2 - x2 * y1
    }
    const ccw = area > 0
    const runs: [number, number][][] = []
    let cur: [number, number][] = []
    for (let i = 0; i <= poly.length; i++) {
      const a = poly[i % poly.length]
      const b = poly[(i + 1) % poly.length]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy) || 1
      const ny = (ccw ? -dx : dx) / len
      if (ny > 0.4 && i < poly.length) {
        if (!cur.length) cur.push(a)
        cur.push(b)
      } else if (cur.length) {
        runs.push(cur)
        cur = []
      }
    }
    for (const run of runs) {
      const line = (offset: number) => {
        ctx.beginPath()
        run.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + offset) : ctx.moveTo(x, y + offset)))
      }
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
    }
  }
}
