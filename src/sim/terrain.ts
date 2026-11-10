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

/** Smooth 0..1 step between a and b. */
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Test track: a flat start, then terrain that gets harder with distance.
 * Layers: long rolling hills, medium hills, sharp crests that throw the car
 * into the air, and short bumps that unsettle the suspension.
 * Task P4 replaces this with the streamed, seeded generator.
 */
export const testHills: HeightFn = (x) => {
  if (x < 15) return 0
  const d = x - 15
  const ease = smoothstep(0, 30, d)
  const grow = 1 + d / 300
  const rolling = 2.6 * Math.sin(d * 0.07) + 1.4 * Math.sin(d * 0.17 + 1.3)
  // Narrow peaks of a raised sine: steep take-off faces and sharp crests.
  const crests = 2.2 * Math.pow(Math.max(0, Math.sin(d * 0.052 + 2.1)), 5) * smoothstep(40, 120, d)
  const bumps = 0.22 * Math.sin(d * 1.3) * Math.sin(d * 0.11) * smoothstep(60, 200, d)
  return ease * (grow * (rolling + crests) + bumps)
}
