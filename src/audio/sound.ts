/**
 * All sound is synthesised with Web Audio: no audio files. Safari only allows audio
 * after a user gesture, so call unlock() from the first tap.
 *
 * Engines: detuned oscillators plus a sub, pulsed at the cylinder firing rate (the putter),
 * soft-saturated, through a low-pass filter that opens with revs, with intake noise on the gas.
 * Each vehicle has its own voice (ENGINES).
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
}

const ENGINES: Record<string, EngineVoice> = {
  // Small four-cylinder buggy: buzzy and eager.
  runabout: { idle: 55, top: 190, firing: 2, pulse: 0.35, grit: 2.5, cutoff: [900, 2600], sub: 0.35, noise: 0.15, waves: ['sawtooth', 'square'], volume: 0.9 },
  // Two-stroke dirt bike: high, raspy, revs fast.
  scrambler: { idle: 85, top: 360, firing: 1, pulse: 0.6, grit: 5, cutoff: [1500, 4500], sub: 0.15, noise: 0.25, waves: ['square', 'sawtooth'], volume: 0.75 },
  // Big V8 truck: deep, burbling, heavy.
  hauler: { idle: 34, top: 120, firing: 4, pulse: 0.5, grit: 1.8, cutoff: [450, 1500], sub: 0.8, noise: 0.1, waves: ['sawtooth', 'sawtooth'], volume: 1.1 },
}

export class Sound {
  private ctx: AudioContext | null = null
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

  /** Create the audio graph on the first tap; later calls just resume it. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined)
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx
    // Gentle compression keeps the mix even and avoids clipping when sounds stack up.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.connect(comp)
    this.applyVolume()
    this.buildEngine()
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
