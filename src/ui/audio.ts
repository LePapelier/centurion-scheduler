/**
 * Sons synthétisés WebAudio, zéro asset. Discrets, coupables (toggle 🔊),
 * préférence en localStorage. Le contexte est créé au premier son
 * (après un geste utilisateur, comme l'exige le navigateur).
 */

const KEY = 'centurion-scheduler-audio'

class AudioFx {
  private ctx: AudioContext | null = null
  enabled = localStorage.getItem(KEY) !== 'off'

  toggle(): boolean {
    this.enabled = !this.enabled
    localStorage.setItem(KEY, this.enabled ? 'on' : 'off')
    return this.enabled
  }

  private ac(): AudioContext | null {
    if (!this.enabled) return null
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Une note : oscillateur + enveloppe exponentielle. */
  private note(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.12,
    delay = 0,
    slideTo?: number,
  ): void {
    const ac = this.ac()
    if (ac === null) return
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
    env.gain.setValueAtTime(gain, t0)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(env).connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  /** Pas joué : tick bref. */
  tick(): void {
    this.note(660, 0.07, 'triangle', 0.09)
  }

  /** Éclosion / balayage : whoosh montant. */
  whoosh(): void {
    this.note(180, 0.5, 'sine', 0.07, 0, 720)
  }

  /** Brique posée : impact à deux notes. */
  impact(): void {
    this.note(220, 0.16, 'triangle', 0.14)
    this.note(440, 0.22, 'sine', 0.1, 0.06)
  }

  /** Violation : nappe sombre descendante. */
  doom(): void {
    this.note(160, 0.7, 'sawtooth', 0.08, 0, 55)
    this.note(80, 0.9, 'sine', 0.1, 0.05, 40)
  }

  /** Victoire : petit carillon. */
  chime(): void {
    for (const [f, d] of [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]] as const)
      this.note(f, 0.35, 'sine', 0.09, d)
  }
}

export const audio = new AudioFx()
