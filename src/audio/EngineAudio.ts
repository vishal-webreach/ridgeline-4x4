/**
 * Procedural vehicle audio with the Web Audio API – no sound files needed.
 *  - Engine: firing-frequency sawtooth + sub-harmonic square through a
 *    load-dependent low-pass, plus intake noise.
 *  - Tyres: band-passed noise scaled by slip.
 *  - Wind: low-passed noise scaled by speed².
 */
class EngineAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private engineGain!: GainNode
  private osc1!: OscillatorNode
  private osc2!: OscillatorNode
  private osc3!: OscillatorNode
  private engineFilter!: BiquadFilterNode
  private intakeGain!: GainNode
  private intakeFilter!: BiquadFilterNode
  private skidGain!: GainNode
  private skidFilter!: BiquadFilterNode
  private windGain!: GainNode
  private muted = false

  start() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.55
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.master.connect(comp).connect(ctx.destination)

    // engine
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.Q.value = 2.5
    const shaper = ctx.createWaveShaper()
    shaper.curve = makeDistortion(8)
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    this.engineFilter.connect(shaper).connect(this.engineGain).connect(this.master)

    this.osc1 = ctx.createOscillator()
    this.osc1.type = 'sawtooth'
    this.osc2 = ctx.createOscillator()
    this.osc2.type = 'square'
    this.osc3 = ctx.createOscillator()
    this.osc3.type = 'triangle'
    const g1 = ctx.createGain()
    g1.gain.value = 0.5
    const g2 = ctx.createGain()
    g2.gain.value = 0.35
    const g3 = ctx.createGain()
    g3.gain.value = 0.3
    this.osc1.connect(g1).connect(this.engineFilter)
    this.osc2.connect(g2).connect(this.engineFilter)
    this.osc3.connect(g3).connect(this.engineFilter)

    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx)
    noise.loop = true

    // intake roar
    this.intakeFilter = ctx.createBiquadFilter()
    this.intakeFilter.type = 'bandpass'
    this.intakeFilter.Q.value = 0.9
    this.intakeGain = ctx.createGain()
    this.intakeGain.gain.value = 0
    noise.connect(this.intakeFilter).connect(this.intakeGain).connect(this.master)

    // tyre skid / gravel
    this.skidFilter = ctx.createBiquadFilter()
    this.skidFilter.type = 'bandpass'
    this.skidFilter.frequency.value = 900
    this.skidFilter.Q.value = 0.7
    this.skidGain = ctx.createGain()
    this.skidGain.gain.value = 0
    noise.connect(this.skidFilter).connect(this.skidGain).connect(this.master)

    // wind
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 420
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    noise.connect(windFilter).connect(this.windGain).connect(this.master)

    this.osc1.start()
    this.osc2.start()
    this.osc3.start()
    noise.start()
  }

  /** Called every frame with the latest telemetry. */
  update(rpm: number, load: number, speedKmh: number, slip: number, running: boolean) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const ramp = 0.05
    // V8, 4 firing pulses per crank revolution
    const fire = (rpm / 60) * 4
    this.osc1.frequency.setTargetAtTime(fire, t, ramp)
    this.osc2.frequency.setTargetAtTime(fire / 2, t, ramp)
    this.osc3.frequency.setTargetAtTime(fire * 1.5, t, ramp)
    this.engineFilter.frequency.setTargetAtTime(250 + load * 1300 + rpm * 0.25, t, ramp)
    const engineVol = running ? 0.18 + load * 0.22 + (rpm / 4500) * 0.08 : 0
    this.engineGain.gain.setTargetAtTime(engineVol, t, 0.08)
    this.intakeFilter.frequency.setTargetAtTime(400 + rpm * 0.35, t, ramp)
    this.intakeGain.gain.setTargetAtTime(running ? load * 0.07 * (rpm / 4500) : 0, t, 0.08)
    const v = Math.abs(speedKmh)
    this.skidGain.gain.setTargetAtTime(slip * Math.min(1, v / 10 + 0.3) * 0.22, t, 0.06)
    this.windGain.gain.setTargetAtTime(Math.min(0.35, (v / 130) ** 2 * 0.35), t, 0.2)
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05)
  }

  suspend() {
    void this.ctx?.suspend()
  }

  resume() {
    void this.ctx?.resume()
  }

  stop() {
    void this.ctx?.close()
    this.ctx = null
  }
}

function makeNoiseBuffer(ctx: AudioContext) {
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    // slightly pink-ish noise
    last = last * 0.6 + (Math.random() * 2 - 1) * 0.4
    d[i] = last
  }
  return buf
}

function makeDistortion(k: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curve
}

export const engineAudio = new EngineAudio()
