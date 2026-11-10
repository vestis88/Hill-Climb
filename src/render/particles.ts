/** Short-lived visual particles in world space: dust, landing puffs, sparkles. Visual only. */
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  colour: string
  gravity: number
}

export class Particles {
  private list: Particle[] = []

  emit(x: number, y: number, opts: { count: number; speed: number; colour: string; size: number; life: number; up?: number; gravity?: number; dir?: number }): void {
    for (let i = 0; i < opts.count; i++) {
      const a = (opts.dir ?? Math.PI / 2) + (Math.random() - 0.5) * 2.2
      const v = opts.speed * (0.4 + Math.random() * 0.6)
      this.list.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + (opts.up ?? 0),
        life: opts.life * (0.6 + Math.random() * 0.4),
        max: opts.life,
        size: opts.size * (0.6 + Math.random() * 0.6),
        colour: opts.colour,
        gravity: opts.gravity ?? -2,
      })
    }
    if (this.list.length > 400) this.list.splice(0, this.list.length - 400)
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    this.list = this.list.filter((p) => p.life > 0)
  }

  clear(): void {
    this.list = []
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.max
      ctx.globalAlpha = Math.min(1, t * 1.5)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * (1.3 - t * 0.5), 0, Math.PI * 2)
      ctx.fillStyle = p.colour
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}
