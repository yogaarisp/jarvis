import type { WakeSettings } from '../types'

/**
 * Wake Engine — PRD §5.
 *
 * Strategi MVP: double-clap / triple-clap detection dengan Web Audio API,
 * berjalan 100% di browser (audio tidak pernah keluar dari perangkat).
 *
 * Algoritma:
 *   - Sampel mic terus melalui AnalyserNode → time-domain
 *   - Cari "impuls" -> puncak amplitudo melewati threshold
 *   - Hitung jumlah impuls dalam `windowMs` terakhir
 *   - Jika >= `clapsRequired`, callback wake dipanggil
 *   - Setelah trigger, cooldown agar tidak double-wake
 *
 * Threshold diadaptasi menurut `sensitivity` setting.
 */
export class WakeEngine {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private rafId: number | null = null
  private running = false
  private lastClaps: number[] = []
  private lastWakeAt = 0
  private energySmooth = 0

  onWake?: (info: { claps: number }) => void
  onLevel?: (rms: number) => void
  onError?: (msg: string) => void
  onReady?: () => void
  onStopped?: () => void

  settings: WakeSettings
  constructor(settings: WakeSettings) {
    this.settings = settings
  }

  updateSettings(settings: WakeSettings): void {
    this.settings = settings
  }

  private threshold(): number {
    // Ambang batas relatif terhadap noise floor; makin sensitif makin kecil.
    switch (this.settings.sensitivity) {
      case 'high':
        return this.energySmooth + 0.18
      case 'low':
        return this.energySmooth + 0.38
      case 'medium':
      default:
        return this.energySmooth + 0.26
    }
  }

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.AudioContext &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    )
  }

  isRunning(): boolean {
    return this.running
  }

  async start(): Promise<void> {
    if (this.running) return
    if (!this.isSupported()) {
      this.onError?.('Web Audio / mic tidak didukung browser ini.')
      return
    }
    if (!this.settings.clap_enabled) {
      this.onError?.('Clap wake belum dinyalakan di pengaturan.')
      return
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (e) {
      this.onError?.(
        'Izin mikrofon ditolak atau perangkat tidak tersedia. Wake engine tidak dapat berjalan.',
      )
      return
    }

    const AC = window.AudioContext
    this.ctx = new AC()
    const source = this.ctx.createMediaStreamSource(this.stream)
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.2
    source.connect(analyser)

    const buf = new Float32Array(analyser.fftSize)
    let inImpulse = false
    let impulseReleasedAt = 0
    const MIN_IMPULSE_GAP_MS = 40

    const tick = () => {
      if (!this.ctx || !this.running) return
      analyser.getFloatTimeDomainData(buf)

      // Hitung RMS + noise floor smoothing.
      let sumSq = 0
      let peak = 0
      for (let i = 0; i < buf.length; i++) {
        const s = buf[i]
        sumSq += s * s
        const a = Math.abs(s)
        if (a > peak) peak = a
      }
      const rms = Math.sqrt(sumSq / buf.length)
      this.energySmooth = 0.94 * this.energySmooth + 0.06 * rms
      this.onLevel?.(rms)

      const now = performance.now()
      const triggered = peak > this.threshold()

      if (triggered && !inImpulse && now - impulseReleasedAt > MIN_IMPULSE_GAP_MS) {
        inImpulse = true
        this.registerClap(now)
      }
      if (!triggered && inImpulse) {
        inImpulse = false
        impulseReleasedAt = now
      }

      this.rafId = requestAnimationFrame(tick)
    }

    this.running = true
    this.rafId = requestAnimationFrame(tick)
    this.onReady?.()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    try {
      this.stream?.getTracks().forEach((t) => t.stop())
    } catch {
      // ignore
    }
    this.stream = null
    try {
      void this.ctx?.close()
    } catch {
      // ignore
    }
    this.ctx = null
    this.onStopped?.()
  }

  /** Catat satu impuls tepukan pada waktu `nowMs`; cek trigger. */
  private registerClap(nowMs: number): void {
    this.lastClaps = this.lastClaps.filter(
      (t) => nowMs - t <= this.settings.window_ms,
    )
    this.lastClaps.push(nowMs)

    if (
      this.lastClaps.length >= this.settings.claps_required &&
      nowMs - this.lastWakeAt >= this.settings.cooldown_ms
    ) {
      this.lastWakeAt = nowMs
      const fired = this.lastClaps.slice(-this.settings.claps_required).length
      this.lastClaps = []
      this.onWake?.({ claps: fired })
    }
  }
}
