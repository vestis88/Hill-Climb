import { runabout } from './data/vehicles'
import { createInput } from './input/input'
import { DebugRenderer } from './render/debug'
import { testHills } from './sim/terrain'
import { Sim, STEP } from './sim/world'

const canvas = document.getElementById('game') as HTMLCanvasElement
const input = createInput(canvas)
const renderer = new DebugRenderer(canvas)

const newSim = () => new Sim({ vehicle: runabout, height: testHills })
let sim = newSim()
let prev = sim.state()
let next = prev

const restart = () => {
  sim = newSim()
  prev = next = sim.state()
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart()
})
// pointerdown, not click: the input layer cancels touch events, which stops iOS synthesising clicks.
document.getElementById('restart')!.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  restart()
})

let last = performance.now()
let accumulator = 0

function frame(now: number): void {
  // Clamp so a backgrounded tab does not fast-forward the simulation.
  accumulator += Math.min(0.1, (now - last) / 1000)
  last = now
  while (accumulator >= STEP) {
    prev = next
    sim.step(input)
    next = sim.state()
    accumulator -= STEP
  }
  renderer.draw(prev, next, accumulator / STEP, runabout, testHills, input)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
