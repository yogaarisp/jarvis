import type { VoicePrefs } from '../types'
import { getToken } from './api'

const PREFS_KEY = 'jarvis_voice_prefs'

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  sttEnabled: true,
  ttsEnabled: true,
  ttsRate: 1,
  ttsPitch: 1,
  language: 'id-ID',
  ttsEngine: 'server',
  ttsServerVoice: 'jarvis-cloned',
}

/** Voice neural server (Microsoft Edge TTS) — pilihan suara neural ala JARVIS & natural. */
export const SERVER_VOICES: Array<{ id: string; label: string; desc?: string; accent?: string; cloned?: boolean }> = [
  { id: 'jarvis-cloned', label: 'JARVIS Cloned (XTTS Lokal) ★', desc: 'Suara cloning AI lokal (XTTS v2) dari referensi Paul Bettany — butuh GPU', accent: 'AI Clone', cloned: true },
  { id: 'en-GB-RyanNeural', label: 'Ryan · Pria British (JARVIS)', desc: 'British English formal & berwibawa ala JARVIS', accent: 'British' },
  { id: 'en-GB-ThomasNeural', label: 'Thomas · Pria British', desc: 'British English natural, artikulasi jernih', accent: 'British' },
  { id: 'en-US-EricNeural', label: 'Eric · Pria Amerika', desc: 'US English percaya diri & modern', accent: 'American' },
  { id: 'en-US-AndrewNeural', label: 'Andrew · Pria Amerika', desc: 'US English hangat & santai', accent: 'American' },
  { id: 'id-ID-ArdiNeural', label: 'Ardi · Pria Indonesia', desc: 'Bahasa Indonesia intonasi formal & jelas', accent: 'Indonesian' },
  { id: 'id-ID-GadisNeural', label: 'Gadis · Wanita Indonesia', desc: 'Bahasa Indonesia wanita natural & ramah', accent: 'Indonesian' },
  { id: 'en-US-GuyNeural', label: 'Guy · Pria Amerika', desc: 'US English kasual & standar', accent: 'American' },
  { id: 'en-US-ChristopherNeural', label: 'Christopher · Pria Amerika (Deep)', desc: 'US English bernada berat & dalam', accent: 'American' },
]

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_VOICE_PREFS }
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    return { ...DEFAULT_VOICE_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_VOICE_PREFS }
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
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
   * Default memakai TTS neural server (en-GB-RyanNeural ala JARVIS);
   * bila server gagal, fallback ke speechSynthesis browser.
   */
  speak(text: string): void {
    if (!this.prefs.ttsEnabled) return
    const clean = text.replace(/\[(\d+)\]/g, '').trim()
    if (!clean) return

    this.cancel()

    if (this.prefs.ttsEngine !== 'browser') {
      this.speakViaServer(clean).then((ok) => {
        if (!ok) {
          // Cloned voice gagal → fallback ke Edge TTS Ryan dulu, lalu browser
          if (this.prefs.ttsServerVoice === 'jarvis-cloned') {
            this.speakViaEdgeFallback(clean).then((ok2) => {
              if (!ok2) this.speakBrowser(clean)
            })
          } else {
            this.speakBrowser(clean)
          }
        }
      })
    } else {
      this.speakBrowser(clean)
    }
  }

  /** TTS neural via backend (Microsoft Edge TTS). Return false bila gagal. */
  private async speakViaServer(text: string): Promise<boolean> {
    const token = getToken()
    if (!token) return false

    // Cloned JARVIS voice — pakai XTTS lokal endpoint terpisah
    if (this.prefs.ttsServerVoice === 'jarvis-cloned') {
      return this.speakViaClone(text, token)
    }

    const params = new URLSearchParams({ text })
    if (this.prefs.ttsServerVoice) params.set('voice', this.prefs.ttsServerVoice)
    const rate = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsRate)) - 1) * 100)
    params.set('rate', `${rate >= 0 ? '+' : ''}${rate}%`)

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
      // 503 = XTTS disabled → fallback ke Edge TTS Ryan
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

  /** Fallback: Edge TTS Ryan Neural saat XTTS clone gagal. */
  private async speakViaEdgeFallback(text: string): Promise<boolean> {
    const token = getToken()
    if (!token) return false

    const rate = Math.round((Math.max(0.6, Math.min(1.6, this.prefs.ttsRate)) - 1) * 100)
    const params = new URLSearchParams({
      text,
      voice: 'en-GB-RyanNeural',
      rate: `${rate >= 0 ? '+' : ''}${rate}%`,
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
