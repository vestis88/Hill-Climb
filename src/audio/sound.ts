/**
 * All sound is synthesised with Web Audio: no audio files. Safari only allows audio
 * after a user gesture, so call unlock() from the first tap.
 *
 * Engines (car and truck): detuned oscillators plus a sub, pulsed at the cylinder firing rate (the putter),
 * soft-saturated, through a low-pass filter that opens with revs, with intake noise on the gas.
 * Each vehicle has its own voice (ENGINES). The two-stroke bike is built differently: see buildTwoStroke.
 */
interface EngineVoice {
  /** Pitch at idle and at full revs, Hz. */
  idle: number
  top: number
  /** Firing pulses per engine cycle: more = smoother; fewer = lumpier. */
  firing: number
  /** How strongly the firing pulses the volume, 0..1. */
  pulse: number
  /** Saturation amount: higher = grittier. */
  grit: number
  /** Filter cutoff off the gas and on full gas, Hz. */
  cutoff: [number, number]
  /** Sub-bass level, 0..1. */
  sub: number
  /** Intake noise level, 0..1. */
  noise: number
  waves: [OscillatorType, OscillatorType]
  volume: number
  /**
   * Single-cylinder two-stroke: played from a loop of real-shaped exhaust pulses instead of
   * oscillators, through a fixed expansion-chamber resonance, with pops when the gas is let go.
   * Its idle/top are firing rates (Hz), so revs = idle..top.
   */
  twoStroke?: boolean
}

const ENGINES: Record<string, EngineVoice> = {
  // Small four-cylinder buggy: buzzy and eager.
  runabout: { idle: 55, top: 190, firing: 2, pulse: 0.35, grit: 2.5, cutoff: [900, 2600], sub: 0.35, noise: 0.15, waves: ['sawtooth', 'square'], volume: 0.9 },
  // Two-stroke dirt bike: ring-a-ding idle, raspy braap on the pipe, pops off the gas.
  // Firing rate 30 Hz (1800 rpm) at idle to 185 Hz (11,000 rpm) flat out.
  scrambler: { idle: 30, top: 185, firing: 1, pulse: 0, grit: 3, cutoff: [1400, 5200], sub: 0, noise: 0.2, waves: ['square', 'square'], volume: 1, twoStroke: true },
  // Big V8 truck: deep, burbling, heavy.
  hauler: { idle: 34, top: 120, firing: 4, pulse: 0.5, grit: 1.8, cutoff: [450, 1500], sub: 0.8, noise: 0.1, waves: ['sawtooth', 'sawtooth'], volume: 1.1 },
}

export class Sound {
  private ctx: BaseAudioContext | null = null
  private master: GainNode | null = null
  private volume = 0.7
  private enabled = true
  private voice: EngineVoice = ENGINES.runabout
  private eng: {
    oscA: OscillatorNode
    oscB: OscillatorNode
    sub: OscillatorNode
    subGain: GainNode
    lfo: OscillatorNode
    lfoDepth: GainNode
    pulseGain: GainNode
    shaper: WaveShaperNode
    filter: BiquadFilterNode
    out: GainNode
    noiseGain: GainNode
  } | null = null
  private bike: {
    on: AudioBufferSourceNode
    off: AudioBufferSourceNode
    onGain: GainNode
    offGain: GainNode
    shaper: WaveShaperNode
    pipe: BiquadFilterNode
    filter: BiquadFilterNode
    out: GainNode
  } | null = null
  private offline = false
  private lastGas = false
  private lastRevs = 0
  private lastEngineCall = 0

  /** Create the audio graph on the first tap; later calls just resume it. */
  unlock(offline?: BaseAudioContext): void {
    if (this.ctx) {
      if (!this.offline && this.ctx.state === 'suspended') (this.ctx as AudioContext).resume().catch(() => undefined)
      return
    }
    // An offline context can be passed in to record the sounds (scripts/sound-demo).
    let ctx = offline
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
    }
    this.ctx = ctx
    this.offline = !!offline
    // Gentle compression keeps the mix even and avoids clipping when sounds stack up.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.connect(comp)
    this.applyVolume()
    this.buildEngine()
    this.buildTwoStroke()
  }

  private buildEngine(): void {
    const ctx = this.ctx!
    const oscA = ctx.createOscillator()
    const oscB = ctx.createOscillator()
    oscB.detune.value = 9
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    const subGain = ctx.createGain()
    const mix = ctx.createGain()
    mix.gain.value = 0.5
    oscA.connect(mix)
    oscB.connect(mix)
    sub.connect(subGain).connect(mix)
    // Firing pulses: an LFO at the firing rate wobbles the volume.
    const pulseGain = ctx.createGain()
    pulseGain.gain.value = 1
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    const lfoDepth = ctx.createGain()
    lfo.connect(lfoDepth).connect(pulseGain.gain)
    mix.connect(pulseGain)
    const shaper = ctx.createWaveShaper()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 1.2
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 28
    const out = ctx.createGain()
    out.gain.value = 0
    pulseGain.connect(shaper).connect(filter).connect(highpass).connect(out).connect(this.master!)
    // Intake: looped noise through a band-pass, louder on the gas.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    noise.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800
    band.Q.value = 0.8
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(band).connect(noiseGain).connect(out)
    for (const o of [oscA, oscB, sub, lfo]) o.start()
    noise.start()
    this.eng = { oscA, oscB, sub, subGain, lfo, lfoDepth, pulseGain, shaper, filter, out, noiseGain }
    this.applyVoice()
  }

  /**
   * One exhaust pulse per firing, recorded at a 100 Hz reference rate into a loop and replayed
   * faster or slower with the revs (playbackRate). Each pulse is a sharp pressure spike with a
   * ringing tail and a puff of noise, varied a little pulse to pulse so it never sounds like a
   * pure tone. The off-throttle loop misses and stutters, as a two-stroke does when it is not
   * loaded ("four-stroking").
   */
  private pulseLoop(count: number, skip: number, roughness: number): AudioBuffer {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const period = Math.round(rate / 100)
    const buffer = ctx.createBuffer(1, period * count, rate)
    const data = buffer.getChannelData(0)
    let seed = 12345 + count
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let p = 0; p < count; p++) {
      const missed = rnd() < skip
      const amp = missed ? 0.12 : 0.75 + rnd() * 0.25 * (1 + roughness)
      const ring = 240 + rnd() * 40
      const start = p * period + Math.floor(rnd() * period * 0.06 * roughness)
      for (let i = 0; i < period; i++) {
        const t = i / rate
        const idx = start + i
        if (idx >= data.length) break
        const body = Math.exp(-t / 0.0016) * (1 - 2 * Math.min(1, t / 0.0006)) // spike, then suck-back
        const tail = Math.exp(-t / 0.003) * Math.sin(2 * Math.PI * ring * t) * 0.45
        const puff = Math.exp(-t / (0.0022 + 0.002 * roughness)) * (rnd() * 2 - 1) * (0.35 + 0.4 * roughness)
        data[idx] += amp * (body + tail + puff)
      }
    }
    return buffer
  }

  private buildTwoStroke(): void {
    const ctx = this.ctx!
    const loop = (buffer: AudioBuffer) => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      return src
    }
    const on = loop(this.pulseLoop(24, 0, 0.3))
    const off = loop(this.pulseLoop(32, 0.35, 1))
    const onGain = ctx.createGain()
    const offGain = ctx.createGain()
    const mix = ctx.createGain()
    on.connect(onGain).connect(mix)
    off.connect(offGain).connect(mix)
    // The expansion chamber: a fixed resonance that "comes on the pipe" at high revs.
    const pipe = ctx.createBiquadFilter()
    pipe.type = 'peaking'
    pipe.frequency.value = 760
    pipe.Q.value = 2.2
    // Hollow body of the silencer.
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 230
    body.Q.value = 1.4
    body.gain.value = 5
    const shaper = ctx.createWaveShaper()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 45
    const out = ctx.createGain()
    out.gain.value = 0
    mix.connect(body).connect(pipe).connect(shaper).connect(filter).connect(highpass).connect(out).connect(this.master!)
    on.start()
    off.start()
    this.bike = { on, off, onGain, offGain, shaper, pipe, filter, out }
    this.applyVoice()
  }

  private applyVoice(): void {
    if (!this.eng) return
    const v = this.voice
    this.eng.oscA.type = v.waves[0]
    this.eng.oscB.type = v.waves[1]
    this.eng.subGain.gain.value = v.sub
    this.eng.lfoDepth.gain.value = v.pulse * 0.5
    // Soft saturation curve (tanh): more grit = harder drive.
    const n = 1024
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = Math.tanh(x * v.grit) / Math.tanh(v.grit)
    }
    this.eng.shaper.curve = curve
    if (this.bike) this.bike.shaper.curve = curve
    // Only one engine sounds at a time: silence the other, cancelling its pending fades.
    const silence = (g: GainNode) => {
      const now = this.ctx!.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(0, now)
    }
    if (!v.twoStroke && this.bike) silence(this.bike.out)
    if (v.twoStroke) silence(this.eng.out)
  }

  /** Switch the engine voice to suit a vehicle. */
  setVehicle(id: string): void {
    this.voice = ENGINES[id] ?? ENGINES.runabout
    this.applyVoice()
  }

  setVolume(volume: number, enabled: boolean): void {
    this.volume = volume
    this.enabled = enabled
    this.applyVolume()
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.enabled ? this.volume * 0.6 : 0
  }

  /** Engine note from wheel spin (0..1) and throttle; running false fades it out. */
  engine(rpm: number, gas: boolean, running: boolean): void {
    if (!this.ctx || !this.eng) return
    const e = this.eng
    const v = this.voice
    const t = this.ctx.currentTime
    // Revs rise a little on the gas even when the wheels cannot spin up (climbing, wheelspin).
    const revs = Math.min(1, rpm + (gas ? 0.12 : 0))
    if (v.twoStroke) {
      this.twoStroke(revs, gas, running, t)
      return
    }
    const f = v.idle + (v.top - v.idle) * revs
    e.oscA.frequency.setTargetAtTime(f, t, 0.04)
    e.oscB.frequency.setTargetAtTime(f * 1.005, t, 0.04)
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.04)
    e.lfo.frequency.setTargetAtTime((f / 2) * (v.firing / 2), t, 0.04)
    const [lo, hi] = v.cutoff
    e.filter.frequency.setTargetAtTime(lo + (hi - lo) * (gas ? 0.4 + 0.6 * revs : 0.15 * revs), t, 0.06)
    e.noiseGain.gain.setTargetAtTime(gas ? v.noise * (0.3 + revs) : 0, t, 0.05)
    e.out.gain.setTargetAtTime(running ? v.volume * (gas ? 0.3 : 0.16) : 0, t, 0.08)
  }

  private twoStroke(revs: number, gas: boolean, running: boolean, t: number): void {
    const b = this.bike
    if (!b) return
    const v = this.voice
    const f = v.idle + (v.top - v.idle) * revs
    // Revs climb fast and drop a bit slower, like a light flywheel.
    const lag = revs > this.lastRevs ? 0.05 : 0.09
    for (const src of [b.on, b.off]) src.playbackRate.setTargetAtTime(f / 100, t, lag)
    b.onGain.gain.setTargetAtTime(gas ? 1 : 0.15, t, 0.03)
    b.offGain.gain.setTargetAtTime(gas ? 0.1 : 0.8, t, 0.04)
    b.pipe.gain.setTargetAtTime(gas ? 2 + 10 * Math.max(0, revs - 0.35) : 2, t, 0.06)
    const [lo, hi] = v.cutoff
    b.filter.frequency.setTargetAtTime(gas ? lo + (hi - lo) * (0.35 + 0.65 * revs) : lo * (0.6 + 0.6 * revs), t, 0.04)
    b.out.gain.setTargetAtTime(running ? v.volume * (gas ? 0.32 : 0.2) : 0, t, 0.08)

    // Pops and bangs: a burst when the gas is snapped shut at revs, then the odd crackle
    // while coasting with revs still up.
    if (running) {
      if (this.lastGas && !gas && this.lastRevs > 0.35) {
        const n = 2 + Math.floor(Math.random() * 3 + this.lastRevs * 2)
        let at = 0.03
        for (let i = 0; i < n; i++) {
          this.pop(at, 0.55 + Math.random() * 0.45)
          at += 0.04 + Math.random() * 0.11
        }
      } else if (!gas && revs > 0.4) {
        const dt = Math.min(0.1, Math.max(0, t - this.lastEngineCall))
        if (Math.random() < dt * 2.2 * revs) this.pop(0, 0.35 + Math.random() * 0.4)
      }
    }
    this.lastGas = gas
    this.lastRevs = revs
    this.lastEngineCall = t
  }

  /** One exhaust bang: a sharp crack through the pipe resonance with a low thump. */
  private pop(start: number, strength: number): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t = ctx.currentTime + start
    const length = 0.05 + Math.random() * 0.04
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      const k = i / data.length
      data[i] = (Math.random() * 2 - 1) * Math.exp(-k * 7) + (i < 40 ? 1 - i / 40 : 0)
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 450 + Math.random() * 700
    band.Q.value = 1.1
    const g = ctx.createGain()
    g.gain.value = 1.6 * strength
    src.connect(band).connect(g).connect(this.master)
    src.start(t)
    this.tone(80 + Math.random() * 30, start, 0.09, 'sine', 0.8 * strength, 38)
  }

  private tone(freq: number, start: number, length: number, type: OscillatorType, gain: number, slideTo?: number): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime + start
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length)
    // Short attack avoids clicks; exponential decay sounds natural.
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  private noise(start: number, length: number, gain: number, cutoff: number): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(filter).connect(g).connect(this.master)
    src.start(ctx.currentTime + start)
  }

  /** A bright two-partial chime. */
  coin(): void {
    this.tone(1568, 0, 0.18, 'sine', 0.22)
    this.tone(3136, 0, 0.12, 'sine', 0.08)
    this.tone(2093, 0.05, 0.25, 'sine', 0.18)
    this.tone(4186, 0.05, 0.15, 'sine', 0.05)
  }

  fuel(): void {
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.05, 0.22, 'triangle', 0.25))
  }

  fanfare(): void {
    ;[523, 659, 784].forEach((f, i) => this.tone(f, i * 0.07, 0.14, 'square', 0.07))
    this.tone(1047, 0.21, 0.35, 'triangle', 0.22)
    this.tone(1319, 0.21, 0.35, 'sine', 0.1)
  }

  land(strength: number): void {
    const s = Math.min(0.8, strength)
    this.noise(0, 0.16, s, 500)
    this.tone(110, 0, 0.18, 'sine', s * 0.6, 45)
  }

  crash(): void {
    this.noise(0, 0.6, 0.9, 1200)
    this.tone(160, 0, 0.45, 'sawtooth', 0.2, 50)
    // Clank: a few inharmonic metal partials.
    for (const [f, d] of [[523, 0.5], [737, 0.4], [1093, 0.3]] as const) this.tone(f, 0.02, d, 'triangle', 0.1)
  }

  tap(): void {
    this.tone(880, 0, 0.06, 'triangle', 0.12)
  }
}
