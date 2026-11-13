import type { Environment } from '../data/environments'
import type { VehicleSpec } from '../sim/types'
import { drawVehicle, drawWheel } from './art'
import { drawBackdrop, drawGround, drawSolids } from './scenery'
import type { PuzzleLevel } from '../data/klurbanor'
import { levelBounds } from '../sim/level'

/** Small pictures for the garage: a vehicle on its own, and an environment's scenery. */
function prepare(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return null
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

export function drawVehiclePreview(canvas: HTMLCanvasElement, spec: VehicleSpec, paint?: string): void {
  const p = prepare(canvas)
  if (!p) return
  const { ctx, w, h } = p
  const xs = spec.wheels.flatMap((wh) => [wh.anchor.x - wh.radius, wh.anchor.x + wh.radius])
  const minX = Math.min(...xs, ...spec.chassis.polygon.map((q) => q.x)) - 0.3
  const maxX = Math.max(...xs, ...spec.chassis.polygon.map((q) => q.x)) + 0.3
  const minY = Math.min(...spec.wheels.map((wh) => wh.anchor.y - wh.radius))
  const maxY = spec.driver.head.y + spec.driver.headRadius + 0.2
  const scale = Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.9
  ctx.save()
  ctx.translate(w / 2 - ((minX + maxX) / 2) * scale, h - 4 + minY * scale)
  ctx.scale(scale, -scale)
  for (const wh of spec.wheels) {
    ctx.save()
    ctx.translate(wh.anchor.x, wh.anchor.y)
    drawWheel(ctx, wh.radius, { mx: spec.id === 'scrambler', paddle: spec.id === 'rover' })
    ctx.restore()
  }
  drawVehicle(ctx, spec, 0, true, 'normal', undefined, paint)
  ctx.restore()
}

export function drawEnvironmentPreview(canvas: HTMLCanvasElement, env: Environment, height: (x: number) => number): void {
  const p = prepare(canvas)
  if (!p) return
  const { ctx, w, h } = p
  drawBackdrop(ctx, env, w, h, 40, 0, 0)
  const view = 30
  const scale = w / view
  ctx.save()
  ctx.translate(0, h * 0.8)
  ctx.scale(scale, -scale)
  ctx.translate(-120, -height(120 + view / 2))
  drawGround(ctx, env, height, 120, 120 + view, -20, 10)
  ctx.restore()
}

/** A Klurbana's whole layout in miniature: its solids, loops, gems and goal flag. */
export function drawLevelPreview(canvas: HTMLCanvasElement, level: PuzzleLevel, env: Environment): void {
  const p = prepare(canvas)
  if (!p) return
  const { ctx, w, h } = p
  const b = levelBounds(level.geom)
  // The walls reach high up; frame the playable part.
  const minY = Math.max(b.minY, Math.min(level.start.y, level.goal.y, ...level.gems.map((g) => g.y)) - 6)
  const maxY = Math.max(level.start.y, level.goal.y, ...level.gems.map((g) => g.y)) + 7
  const scale = Math.min(w / (b.maxX - b.minX), h / (maxY - minY))
  ctx.fillStyle = env.palette.skyBottom
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate((w - (b.maxX - b.minX) * scale) / 2, h)
  ctx.scale(scale, -scale)
  ctx.translate(-b.minX, -minY)
  drawSolids(ctx, env, level.geom.polygons, b.minX, b.maxX)
  ctx.lineWidth = 0.35
  ctx.strokeStyle = '#59627a'
  for (const l of level.geom.loops ?? []) {
    ctx.beginPath()
    ctx.arc(l.cx, l.cy, l.r + 0.2, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#b44cff'
  for (const g of level.gems) {
    ctx.beginPath()
    ctx.arc(g.x, g.y, 0.9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(level.goal.x - 0.25, level.goal.y - 1, 0.5, 3)
  ctx.fillStyle = '#e5383b'
  ctx.fillRect(level.start.x - 0.8, level.start.y + 0.3, 1.6, 1)
  ctx.restore()
}
