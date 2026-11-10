import { Body, Chain, Vec2, World } from 'planck'
import type { HeightFn } from './types'

export const TERRAIN_FRICTION = 0.9

/**
 * Builds a static ground body from a height function.
 * P1 builds one fixed span; task P4 replaces this with streamed chunks.
 */
export function buildTerrain(world: World, height: HeightFn, fromX: number, toX: number, step = 0.5): Body {
  const body = world.createBody()
  const points: Vec2[] = []
  for (let x = fromX; x <= toX; x += step) points.push(new Vec2(x, height(x)))
  body.createFixture(new Chain(points, false), { friction: TERRAIN_FRICTION })
  return body
}

export const flat: HeightFn = () => 0

/** Test track: a flat start, then rolling hills that grow with distance. */
export const testHills: HeightFn = (x) => {
  if (x < 15) return 0
  const d = x - 15
  const ramp = Math.min(1, d / 40)
  const grow = 1 + d / 400
  return ramp * grow * (1.6 * Math.sin(d * 0.11) + 0.9 * Math.sin(d * 0.27 + 1.3) + 0.35 * Math.sin(d * 0.71 + 0.4))
}
