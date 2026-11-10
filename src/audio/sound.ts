/**
 * All sound is synthesised with Web Audio: no audio files. Safari only allows audio
 * after a user gesture, so call unlock() from the first tap.
 */
export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineSub: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private volume = 0.7
  private enabled = true

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
    this.master = ctx.createGain()
    this.master.connect(ctx.destination)
    this.applyVolume()

    // Engine: a sawtooth and a square an octave down, through a low-pass filter.
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 700
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    this.engineOsc = ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineSub = ctx.createOscillator()
    this.engineSub.type = 'square'
    const subGain = ctx.createGain()
    subGain.gain.value = 0.5
    this.engineOsc.connect(this.engineFilter)
    this.engineSub.connect(subGain).connect(this.engineFilter)
    this.engineFilter.connect(this.engineGain).connect(this.master)
    this.engineOsc.start()
    this.engineSub.start()
  }

  setVolume(volume: number, enabled: boolean): void {
    this.volume = volume
    this.enabled = enabled
    this.applyVolume()
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.enabled ? this.volume * 0.5 : 0
  }

  /** Engine note from wheel spin (0..1) and throttle; running false fades it out. */
  engine(rpm: number, gas: boolean, running: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineSub || !this.engineGain || !this.engineFilter) return
    const t = this.ctx.currentTime
    const f = 55 + rpm * 130 + (gas ? 18 : 0)
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05)
    this.engineSub.frequency.setTargetAtTime(f / 2, t, 0.05)
    this.engineFilter.frequency.setTargetAtTime(gas ? 1400 : 600, t, 0.08)
    this.engineGain.gain.setTargetAtTime(running ? (gas ? 0.22 : 0.1) : 0, t, 0.08)
  }

  private tone(freq: number, start: number, length: number, type: OscillatorType, gain: number, slideTo?: number): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime + start
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + length)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + length + 0.02)
  }

  private noise(start: number, length: number, gain: number, cutoff: number): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
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

  coin(): void {
    this.tone(1320, 0, 0.08, 'square', 0.12)
    this.tone(1760, 0.06, 0.12, 'square', 0.1)
  }

  fuel(): void {
    this.tone(523, 0, 0.12, 'triangle', 0.3)
    this.tone(784, 0.1, 0.18, 'triangle', 0.3)
  }

  fanfare(): void {
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.08, 0.16, 'square', 0.1))
  }

  land(strength: number): void {
    this.noise(0, 0.12, Math.min(0.6, strength), 400)
  }

  crash(): void {
    this.noise(0, 0.5, 0.8, 900)
    this.tone(180, 0, 0.4, 'sawtooth', 0.2, 60)
  }

  tap(): void {
    this.tone(880, 0, 0.05, 'triangle', 0.15)
  }
}
