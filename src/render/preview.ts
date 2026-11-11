import type { Environment } from '../data/environments'
import type { VehicleSpec } from '../sim/types'
import { drawVehicle, drawWheel } from './art'
import { drawBackdrop, drawGround } from './scenery'

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

export function drawVehiclePreview(canvas: HTMLCanvasElement, spec: VehicleSpec): void {
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
  drawVehicle(ctx, spec, 0, true)
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
