import type { Environment } from '../data/environments'
import type { HeightFn } from '../sim/types'
import { OUTLINE } from './art'

/** Sky, parallax backgrounds, terrain and terrain props. See STYLE.md. */
type Ctx = CanvasRenderingContext2D

/** Deterministic 0..1 hash of an integer, for placing props and stars. */
export function hash01(i: number, salt = 0): number {
  let h = Math.imul(i ^ Math.imul(salt + 0x51ed27, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function ridge(x: number, salt: number, scale: number): number {
  const i = Math.floor(x / scale)
  const t = x / scale - i
  const u = t * t * (3 - 2 * t)
  return hash01(i, salt) * (1 - u) + hash01(i + 1, salt) * u
}

/** Screen-space background: gradient sky, sun/planet, stars or clouds, and two parallax ridges. */
export function drawBackdrop(ctx: Ctx, env: Environment, w: number, h: number, camX: number, time: number): void {
  const p = env.palette
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, p.skyTop)
  sky.addColorStop(1, p.skyBottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  if (env.id === 'crater') {
    for (let i = 0; i < 90; i++) {
      const x = (hash01(i, 1) * w * 1.5 - camX * 2) % w
      const sx = x < 0 ? x + w : x
      const tw = 0.5 + 0.5 * Math.sin(time * 2 + i)
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.5 * tw * hash01(i, 2)})`
      ctx.fillRect(sx, hash01(i, 3) * h * 0.6, 2, 2)
    }
    ctx.beginPath()
    ctx.arc(w * 0.78, h * 0.2, Math.min(w, h) * 0.09, 0, Math.PI * 2)
    ctx.fillStyle = '#7fb6e6'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(w * 0.76, h * 0.18, Math.min(w, h) * 0.035, 0, Math.PI * 2)
    ctx.fillStyle = '#5fa860'
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.arc(w * 0.82, h * 0.18, Math.min(w, h) * 0.07, 0, Math.PI * 2)
    ctx.fillStyle = env.id === 'frost' ? '#fffaf0' : '#ffe58a'
    ctx.fill()
    // Clouds drift slowly and scroll a little with the camera.
    for (let i = 0; i < 6; i++) {
      const span = w + 300
      const x = ((hash01(i, 4) * span - camX * 3 - time * 8) % span + span) % span - 150
      const y = h * (0.08 + 0.25 * hash01(i, 5))
      const s = 30 + 30 * hash01(i, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.2, 0.75], [-0.9, 0.25, 0.7], [0.4, -0.35, 0.7]]) {
        ctx.beginPath()
        ctx.arc(x + dx * s, y + dy * s * 0.6, r * s * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Far and near ridges: move at 10% and 30% of the camera speed.
  const layer = (speed: number, base: number, height: number, colour: string, salt: number, scale: number) => {
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w + 8; x += 8) {
      const wx = x + camX * speed
      const y = h * base - height * (0.6 * ridge(wx, salt, scale) + 0.4 * ridge(wx, salt + 9, scale * 0.37))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = colour
    ctx.fill()
  }
  const peaky = env.id === 'frost' ? 1.5 : 1
  layer(10, 0.62, h * 0.32 * peaky, p.far, 21, 260)
  if (env.id === 'frost') {
    // Snow caps: a lighter band along the far ridge tops.
    ctx.save()
    ctx.globalAlpha = 0.6
    layer(10, 0.62, h * 0.32 * peaky, '#ffffff', 21, 260)
    ctx.restore()
    layer(10, 0.66, h * 0.3 * peaky, p.far, 21, 260)
  }
  layer(30, 0.75, h * 0.25, p.near, 33, 180)
}

/** World-space ground: shaded fill, a surface band with an outline, and props along it. */
export function drawGround(ctx: Ctx, env: Environment, height: HeightFn, left: number, right: number, bottom: number): void {
  const p = env.palette
  const stepX = 0.25
  const surface = () => {
    for (let x = left; x <= right; x += stepX) ctx.lineTo(x, height(x))
  }
  // Fill
  ctx.beginPath()
  ctx.moveTo(left, bottom)
  surface()
  ctx.lineTo(right, bottom)
  ctx.closePath()
  ctx.fillStyle = p.ground
  ctx.fill()
  // Darker strata lines for depth
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 0.35
  for (const depth of [1.6, 3.4, 5.8]) {
    ctx.beginPath()
    for (let x = left; x <= right; x += 1) ctx.lineTo(x, height(x) - depth - 0.4 * Math.sin(x * 0.21 + depth))
    ctx.stroke()
  }
  ctx.restore()
  // Surface band
  ctx.beginPath()
  surface()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 0.55
  ctx.strokeStyle = OUTLINE
  ctx.stroke()
  ctx.lineWidth = 0.42
  ctx.strokeStyle = p.surface
  ctx.stroke()

  // Props every few metres, chosen by hash so they never move between frames.
  for (let i = Math.floor(left / 3); i <= right / 3; i++) {
    const r = hash01(i, env.seed)
    if (r > 0.45) continue
    const x = i * 3 + hash01(i, 7) * 2
    const y = height(x)
    const s = 0.6 + hash01(i, 8) * 0.6
    if (env.id === 'meadow') {
      ctx.strokeStyle = '#3c7f30'
      ctx.lineWidth = 0.07
      for (const dx of [-0.12, 0, 0.12]) {
        ctx.beginPath()
        ctx.moveTo(x + dx, y + 0.15)
        ctx.lineTo(x + dx * 2.2, y + 0.15 + 0.35 * s)
        ctx.stroke()
      }
      if (r < 0.08) {
        ctx.beginPath()
        ctx.arc(x + 0.25, y + 0.45 * s, 0.08, 0, Math.PI * 2)
        ctx.fillStyle = hash01(i, 9) > 0.5 ? '#ffd23f' : '#ff7eb6'
        ctx.fill()
      }
    } else if (env.id === 'crater') {
      ctx.beginPath()
      ctx.ellipse(x, y + 0.1, 0.25 * s, 0.14 * s, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#6c6d78'
      ctx.fill()
      ctx.lineWidth = 0.04
      ctx.strokeStyle = OUTLINE
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(x - 0.06, y + 0.2)
      ctx.lineTo(x, y + 0.2 + 0.25 * s)
      ctx.lineTo(x + 0.06, y + 0.2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    }
  }
}

/** Falling snow in Frost Pass, in screen space. */
export function drawWeather(ctx: Ctx, env: Environment, w: number, h: number, camX: number, time: number): void {
  if (env.id !== 'frost') return
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (let i = 0; i < 70; i++) {
    const x = (((hash01(i, 11) * w * 1.3 - camX * 18 + Math.sin(time + i) * 12) % w) + w) % w
    const y = (hash01(i, 12) * h + time * (25 + 30 * hash01(i, 13))) % h
    ctx.beginPath()
    ctx.arc(x, y, 1.5 + 1.5 * hash01(i, 14), 0, Math.PI * 2)
    ctx.fill()
  }
}
