import type { VoicePrefs } from '../types'
import { getToken } from './api'

const PREFS_KEY = 'jarvis_voice_prefs'
/**
 * Versi skema prefs. Naikkan bila default suara berubah — prefs versi lama
 * di-migrate (suara di-reset ke default baru, preferensi lain dipertahankan).
 * v2: default suara → 'jarvis-cloned' (JARVIS Master / XTTS lokal).
 * v3: default suara → 'en-GB-RyanNeural' (Edge Neural — production-ready di VPS).
 * v4: default suara → 'jarvis-cloned' kembali (hanya JARVIS Master yang ditampilkan di UI).
 */
const PREFS_VERSION = 4

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  sttEnabled: true,
  ttsEnabled: true,
  ttsRate: 1,
  ttsPitch: 1,
  language: 'id-ID',
  ttsEngine: 'server',
  ttsServerVoice: 'jarvis-cloned',
}

/** Satu-satunya pilihan suara: JARVIS Master (Paul Bettany) via XTTS clone lokal.
 *  Fallback tetap ada di belakang layar: saat XTTS 503 / tidak tersedia → Edge TTS en-GB-RyanNeural → browser TTS.
 *  (Fallback ini internal dan tidak tampil ke user sebagai pilihan.)
 */
export const SERVER_VOICES: Array<{ id: string; label: string; desc?: string; accent?: string; cloned?: boolean; engine?: 'edge' | 'xtts' }> = [
  { id: 'jarvis-cloned', label: 'JARVIS Master (Paul Bettany) ★', desc: 'Suara asli JARVIS film Iron Man via XTTS v2 clone lokal (butuh GPU lokal). Production VPS CPU auto fallback ke Edge TTS Ryan Neural.', accent: 'AI Clone (XTTS v2) → fallback British Ryan Neural', engine: 'xtts', cloned: true },
]

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_VOICE_PREFS, version: PREFS_VERSION }
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    const prefs: VoicePrefs = { ...DEFAULT_VOICE_PREFS, ...parsed }
    // Migrasi versi lama: terapkan default suara baru (JARVIS Master clone),
    // preferensi lain (rate, language, engine) tetap dipertahankan.
    if ((parsed.version ?? 1) < PREFS_VERSION) {
      prefs.ttsServerVoice = DEFAULT_VOICE_PREFS.ttsServerVoice
      saveVoicePrefs(prefs)
    }
    return prefs
  } catch {
    return { ...DEFAULT_VOICE_PREFS, version: PREFS_VERSION }
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }))
}

export function isSttAvailable(): boolean {
  return typeof window !== 'undefined' && 'webkitSpeechRecognition' in window
}

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Kandidat suara pria Inggris (ala JARVIS), urut prioritas.
 * Mencakup nama voice umum: Windows (Ryan/Thomas/George), Chrome (Google UK
 * English Male), macOS/iOS (Daniel/Arthur), Android (en-GB Male).
 */
const UK_MALE_HINTS = [
  'uk english male',
  'ryan',
  'george',
  'arthur',
  'daniel',
  'oliver',
  'thomas',
  'liam',
  'james',
  'brian',
  'male',
]

/** Cari voice en-GB pria; fallback ke voice Inggris mana pun. */
export function pickBritishMaleVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined
  const gb = voices.filter((v) => v.lang?.toLowerCase().startsWith('en-gb'))
  const pool = gb.length ? gb : voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  if (!pool.length) return undefined
  for (const hint of UK_MALE_HINTS) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(hint))
    if (hit) return hit
  }
  return pool[0]
}

/**
 * STT manager (browser SpeechRecognition).
 *
 * Perhatian (PRD §7):
 *   - Semua perekaman HANYA dijalankan setelah user mengizinkan mic +
 *     (saat PRESS-TO-TALK) menekan tombol.
 *   - Tidak pernah merekam diam-diam — start/stop selalu eksplisit.
 *   - Hasil transkripsi dikirim ke AI sebagai pesan biasa, tidak disimpan
 *     ke storage terpisah selain percakapan.
 */
export class SttEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any | null = null
  private active = false
  private manualStop = false
  public finalText = ''
  public interimText = ''

  onFinal?: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (msg: string) => void
  onStart?: () => void
  onStop?: () => void

  lang: string
  continuous: boolean
  constructor(lang: string = 'id-ID', continuous: boolean = false) {
    this.lang = lang
    this.continuous = continuous
  }

  isAvailable(): boolean {
    return isSttAvailable()
  }

  start(): void {
    if (this.active) return
    if (!this.isAvailable()) {
      this.onError?.('Speech Recognition tidak didukung browser ini.')
      return
    }

    const Ctor =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) {
      this.onError?.('Speech Recognition tidak ditemukan.')
      return
    }

    const rec = new Ctor() as {
      lang: string
      continuous: boolean
      interimResults: boolean
      maxAlternatives: number
      onresult: ((ev: unknown) => void) | null
      onerror: ((ev: unknown) => void) | null
      onend: (() => void) | null
      onstart: (() => void) | null
      start: () => void
      stop: () => void
      abort: () => void
    }
    rec.lang = this.lang
    rec.continuous = this.continuous
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = ev as any
      let interim = ''
      let fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i] as { isFinal: boolean; 0: { transcript: string } }
        if (r.isFinal) fin += r[0].transcript
        else interim += r[0].transcript
      }
      if (fin) {
        this.finalText += (this.finalText ? ' ' : '') + fin.trim()
        this.onFinal?.(this.finalText)
      }
      this.interimText = interim
      this.onInterim?.(this.interimText)
    }

    rec.onerror = (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = ((ev as any)?.error as string) ?? 'unknown'
      if (code === 'no-speech' || code === 'aborted') {
        // Tidak perlu log error keras.
        return
      }
      const msgMap: Record<string, string> = {
        'not-allowed': 'Izin mikrofon ditolak. Periksa izin browser.',
        'service-not-allowed': 'Layanan STT tidak tersedia.',
        network: 'Masalah jaringan saat STT.',
        audio: 'Perangkat audio bermasalah.',
      }
      this.onError?.(msgMap[code] ?? `STT error: ${code}`)
    }

    rec.onstart = () => {
      this.active = true
      this.finalText = ''
      this.interimText = ''
      this.manualStop = false
      this.onStart?.()
    }

    rec.onend = () => {
      const wasActive = this.active
      this.active = false
      if (wasActive) this.onStop?.()
      if (!this.manualStop && this.continuous && this.isAvailable()) {
        // Auto-restart untuk mode continuous (misal setelah wake-clap).
        // Diberi jeda agar tidak loop ketat.
        setTimeout(() => {
          if (!this.active) this.start()
        }, 120)
      }
    }

    this.recognition = rec
    try {
      rec.start()
    } catch (e) {
      // Browser kadang melempar saat sudah start.
    }
  }

  stop(): string {
    this.manualStop = true
    try {
      this.recognition?.stop()
    } catch {
      // ignore
    }
    return this.finalText.trim()
  }

  cancel(): void {
    this.manualStop = true
    try {
      this.recognition?.abort()
    } catch {
      // ignore
    }
    this.finalText = ''
    this.interimText = ''
  }

  isListening(): boolean {
    return this.active
  }

  /** Punya transkrip siap dipakai (final maupun interim yang belum difinalisasi). */
  hasTranscript(): boolean {
    return this.finalText.trim() !== '' || this.interimText.trim() !== ''
  }
}

/**
 * TTS engine berbasis browser speechSynthesis (suara = lokal).
 * PRD §7: tidak perlu cloud, karena teks jawaban relatif pendek.
 */
export class TtsEngine {
  private speaking = false
  private prefs: VoicePrefs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentAudio: any | null = null

  onStart?: () => void
  onEnd?: () => void

  constructor(prefs?: VoicePrefs) {
    this.prefs = prefs ?? loadVoicePrefs()
  }

  updatePrefs(prefs: VoicePrefs): void {
    this.prefs = prefs
  }

  isAvailable(): boolean {
    return isTtsAvailable()
  }

  listVoices(): SpeechSynthesisVoice[] {
    if (!this.isAvailable()) return []
    return window.speechSynthesis.getVoices()
  }

  private pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.listVoices()
    if (!voices.length) return undefined
    if (this.prefs.voiceName) {
      const match = voices.find((v) => v.name === this.prefs.voiceName)
      if (match) return match
    }
    // Default: suara pria Inggris ala JARVIS.
    const uk = pickBritishMaleVoice(voices)
    if (uk) return uk
    const local = voices.find(
      (v) => v.lang && v.lang.toLowerCase().startsWith(this.prefs.language.split('-')[0].toLowerCase()),
    )
    return local ?? voices[0]
  }

  /**
   * Ucapkan teks. Bila sedang berbicara, yang lama dibatalkan.
   * Flow:
   *   - Edge Neural (pilihan production): /api/tts (backend auto pilih native voice: ID → Ardi, EN → Ryan)
   *   - XTTS Clone (lokal GPU): /api/tts/clone → fallback ke Edge TTS → browser
   *   - Browser: speechSynthesis Web Speech API
   */
  speak(text: string): void {
    if (!this.prefs.ttsEnabled) return
    const clean = text.replace(/\[(\d+)\]/g, '').trim()
    if (!clean) return

    this.cancel()

    if (this.prefs.ttsEngine !== 'browser') {
      const isXtts = this.prefs.ttsServerVoice === 'jarvis-cloned'
      const firstTry = isXtts
        ? this.speakViaClone(clean, getToken() ?? '')
            .then((ok) => ok ? true : this.speakViaEdgeFallback(clean))
        : this.speakViaServer(clean)
      firstTry.then((ok) => {
        if (!ok) this.speakBrowser(clean)
      })
    } else {
      this.speakBrowser(clean)
    }
  }

  /** TTS neural via backend (Microsoft Edge TTS). Return false bila gagal.
   *  Backend akan override voice ke native (ArdiNeural untuk Indo, Ryan untuk Inggris)
   *  agar tidak kaku meskipun UI setting = JARVIS Master clone.
   */
  private async speakViaServer(text: string): Promise<boolean> {
    const token = getToken()
    if (!token) return false

    const params = new URLSearchParams({ text, lang: this.prefs.language })
    if (this.prefs.ttsServerVoice) params.set('voice', this.prefs.ttsServerVoice)
    const rate = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsRate)) - 1) * 100)
    const pitch = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsPitch)) - 1) * 50)
    params.set('rate', `${rate >= 0 ? '+' : ''}${rate}%`)
    params.set('pitch', `${pitch >= 0 ? '+' : ''}${pitch}Hz`)

    try {
      const resp = await fetch(`/api/tts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return false
      const blob = await resp.blob()
      if (!blob.size) return false

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      this.currentAudio = audio
      audio.onplay = () => {
        this.speaking = true
        this.onStart?.()
      }
      audio.onended = () => {
        URL.revokeObjectURL(url)
        this.speaking = false
        this.currentAudio = null
        this.onEnd?.()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        this.speaking = false
        this.currentAudio = null
        this.onEnd?.()
      }
      await audio.play()
      return true
    } catch {
      return false
    }
  }

  /**
   * Kirim ke endpoint XTTS clone (/api/tts/clone).
   * Fallback otomatis ke Edge TTS bila XTTS disabled/gagal.
   */
  private async speakViaClone(text: string, token: string): Promise<boolean> {
    // Deteksi bahasa: id-ID → 'id' tidak didukung XTTS, maka kirim 'en'
    const xttsLang = this.prefs.language.startsWith('id') ? 'en' : this.prefs.language.split('-')[0]
    const params = new URLSearchParams({ text, language: xttsLang })

    try {
      const resp = await fetch(`/api/tts/clone?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      // 503 = XTTS disabled → fallback ke Edge TTS native bahasa
      if (resp.status === 503) return false
      if (!resp.ok) return false
      const blob = await resp.blob()
      if (!blob.size) return false

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      this.currentAudio = audio
      audio.onplay = () => {
        this.speaking = true
        this.onStart?.()
      }
      audio.onended = () => {
        URL.revokeObjectURL(url)
        this.speaking = false
        this.currentAudio = null
        this.onEnd?.()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        this.speaking = false
        this.currentAudio = null
        this.onEnd?.()
      }
      await audio.play()
      return true
    } catch {
      return false
    }
  }

  /**
   * Fallback: Edge TTS setelah XTTS clone gagal.
   * Tidak hardcode Ryan British lagi → kirim `lang` dan backend akan
   * pilih native voice (ID → ArdiNeural, EN → RyanNeural) agar tidak kaku.
   */
  private async speakViaEdgeFallback(text: string): Promise<boolean> {
    const token = getToken()
    if (!token) return false

    const rate = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsRate)) - 1) * 100)
    const pitch = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsPitch)) - 1) * 50)
    const params = new URLSearchParams({
      text,
      lang: this.prefs.language,
      rate: `${rate >= 0 ? '+' : ''}${rate}%`,
      pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
    })

    try {
      const resp = await fetch(`/api/tts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) return false
      const blob = await resp.blob()
      if (!blob.size) return false

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      this.currentAudio = audio
      audio.onplay = () => { this.speaking = true; this.onStart?.() }
      audio.onended = () => { URL.revokeObjectURL(url); this.speaking = false; this.currentAudio = null; this.onEnd?.() }
      audio.onerror = () => { URL.revokeObjectURL(url); this.speaking = false; this.currentAudio = null; this.onEnd?.() }
      await audio.play()
      return true
    } catch {
      return false
    }
  }

  private speakBrowser(text: string): void {
    if (!this.isAvailable()) return

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = this.prefs.language
    utter.rate = Math.max(0.5, Math.min(2, this.prefs.ttsRate))
    utter.pitch = Math.max(0, Math.min(2, this.prefs.ttsPitch))
    const v = this.pickVoice()
    if (v) utter.voice = v

    utter.onstart = () => {
      this.speaking = true
      this.onStart?.()
    }
    utter.onend = () => {
      this.speaking = false
      this.onEnd?.()
    }
    utter.onerror = () => {
      this.speaking = false
      this.onEnd?.()
    }

    window.speechSynthesis.speak(utter)
  }

  cancel(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause()
      } catch {
        // ignore
      }
      this.currentAudio = null
      if (this.speaking) {
        this.speaking = false
        this.onEnd?.()
      }
    }
    if (!this.isAvailable()) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    if (this.speaking) {
      this.speaking = false
      this.onEnd?.()
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }
}
